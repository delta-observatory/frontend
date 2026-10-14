import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getJson, pool } from "../api/client";
import type { RunDetail, RunRequest, RunSummary, ValidationErrorBody } from "../api/types";

const busy = (r: RunSummary) => (r.job_states.queued ?? 0) + (r.job_states.running ?? 0) > 0;

/**
 * The run list. It refreshes every 2 s while a job waits or runs, and every 15 s at other times.
 * `expect` adds a run from its POST response at once. A GET directly after the POST can still return
 * the old list, so the list refreshes every 0.5 s until the API lists the run, for at most 10 attempts.
 */
export function useRuns(): { runs: RunSummary[] | null; error: string | null; refresh: () => void; expect: (run: RunDetail) => void } {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const expected = useRef<{ run: RunSummary; tries: number } | null>(null);
  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    const g = ++generation.current;
    const next = (ms: number) => { if (g === generation.current) timer.current = window.setTimeout(refresh, ms); };
    getJson<RunSummary[]>("/runs").then(
      (r) => {
        if (g !== generation.current) return;
        const e = expected.current;
        if (e && !r.some((x) => x.id === e.run.id) && e.tries < 10) { e.tries++; setRuns([e.run, ...r]); next(500); return; }
        expected.current = null;
        setRuns(r); setError(null); next(r.some(busy) ? 2000 : 15000);
      },
      (err: Error) => { if (g === generation.current) { setError(err.message); next(15000); } },
    );
  }, []);
  const expect = useCallback((d: RunDetail) => {
    const run: RunSummary = { id: d.id, method_id: d.method_id, method_version: d.method_version, label: d.label, created_at: d.created_at, parameters_sha256: d.parameters_sha256, input_count: d.inputs.length, job_states: { queued: d.jobs.length } };
    details.set(d.id, d);
    expected.current = { run, tries: 0 };
    setRuns((r) => [run, ...(r ?? []).filter((x) => x.id !== d.id)]);
    refresh();
  }, [refresh]);
  useEffect(() => { refresh(); return () => { generation.current++; clearTimeout(timer.current); }; }, [refresh]);
  return { runs, error, refresh, expect };
}

/** Run details. A run's parameters never change, so they stay cached. Job states reload with the key. */
const details = new Map<string, RunDetail>();
export function useRunDetail(id: string | null, key: string): RunDetail | null {
  const [d, setD] = useState<RunDetail | null>(id ? details.get(id) ?? null : null);
  useEffect(() => {
    if (!id) { setD(null); return; }
    let live = true;
    setD(details.get(id) ?? null);
    getJson<RunDetail>(`/runs/${id}`).then((r) => { details.set(id, r); if (live) setD(r); }, () => {});
    return () => { live = false; };
  }, [id, key]);
  return d;
}

export async function fetchRunDetail(id: string): Promise<RunDetail> {
  const hit = details.get(id);
  if (hit) return hit;
  const r = await getJson<RunDetail>(`/runs/${id}`);
  details.set(id, r);
  return r;
}

export type SubmitResult = { ok: true; run: RunDetail } | { ok: false; fieldErrors: Map<string, string>; message: string };

/** POST /api/runs. A 422 response maps each error to its parameter path, for example "search.maximum_period". */
export async function submitRun(req: RunRequest): Promise<SubmitResult> {
  const res = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(req) });
  if (res.status === 201) return { ok: true, run: (await res.json()) as RunDetail };
  const fieldErrors = new Map<string, string>();
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as ValidationErrorBody;
    if (typeof body.detail === "string") message = body.detail;
    else {
      const loose: string[] = [];
      for (const e of body.detail) {
        const loc = e.loc.map(String);
        if (loc[0] === "parameters" && loc.length > 1) fieldErrors.set(loc.slice(1).join("."), e.msg);
        else loose.push(`${loc.join(".")}: ${e.msg}`);
      }
      message = loose.length ? loose.join(" · ") : "The API rejected the parameters.";
    }
  } catch { /* The body was not JSON. The status line is the message. */ }
  return { ok: false, fieldErrors, message };
}

/** Cancels every queued job of a run. A job that a worker claimed first gives 409 and continues. */
export async function cancelQueued(runId: string): Promise<{ cancelled: number; started: number }> {
  const run = await getJson<RunDetail>(`/runs/${runId}`);
  const queued = run.jobs.filter((j) => j.state === "queued");
  let cancelled = 0, started = 0;
  await pool(queued, 4, async (j) => {
    const res = await fetch(`/api/jobs/${j.id}/cancel`, { method: "POST" });
    if (res.ok) cancelled++;
    else if (res.status === 409) started++;
    else throw new ApiError(res.status, `/jobs/${j.id}/cancel`, `${res.status} ${res.statusText}`);
  });
  return { cancelled, started };
}
