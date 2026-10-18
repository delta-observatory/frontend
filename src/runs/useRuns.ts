import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch, getJson } from "../api/client";
import type { RunDetail, RunEstimate, RunRequest, RunSummary, ValidationErrorBody } from "../api/types";

const busy = (r: RunSummary) => (r.job_states.queued ?? 0) + (r.job_states.running ?? 0) > 0;

/**
 * The run list. It refreshes every 2 s while a job waits or runs, and every 15 s at other times.
 * `expect` adds a run from its POST response at once, then refreshes the list.
 */
export function useRuns(): { runs: RunSummary[] | null; error: string | null; refresh: () => void; expect: (run: RunDetail) => void } {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    const g = ++generation.current;
    const next = (ms: number) => { if (g === generation.current) timer.current = window.setTimeout(refresh, ms); };
    getJson<RunSummary[]>("/runs").then(
      (r) => {
        if (g !== generation.current) return;
        setRuns(r); setError(null); next(r.some(busy) ? 2000 : 15000);
      },
      (err: Error) => { if (g === generation.current) { setError(err.message); next(15000); } },
    );
  }, []);
  const expect = useCallback((d: RunDetail) => {
    const run: RunSummary = { id: d.id, method_id: d.method_id, method_version: d.method_version, label: d.label, created_at: d.created_at, parameters_sha256: d.parameters_sha256, input_count: d.inputs.length, job_states: { queued: d.jobs.length } };
    details.set(d.id, d);
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

export type Rejection = { ok: false; fieldErrors: Map<string, string>; message: string };
export type SubmitResult = { ok: true; run: RunDetail } | Rejection;
export type EstimateResult = { ok: true; estimate: RunEstimate } | Rejection;

const post = (path: string, req: RunRequest) =>
  apiFetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(req) });

/** POST /api/runs. A 422 response maps each error to its parameter path, for example "search.maximum_period". */
export async function submitRun(req: RunRequest): Promise<SubmitResult> {
  const res = await post("/runs", req);
  if (res.status === 201) return { ok: true, run: (await res.json()) as RunDetail };
  return rejection(res);
}

/** POST /api/runs/estimate: the same checks as POST /api/runs, and the work estimate. It writes nothing. */
export async function estimateRun(req: RunRequest): Promise<EstimateResult> {
  const res = await post("/runs/estimate", req);
  if (res.ok) return { ok: true, estimate: (await res.json()) as RunEstimate };
  return rejection(res);
}

async function rejection(res: Response): Promise<Rejection> {
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

/** POST /api/runs/{id}/cancel: cancels every queued and running job of the run. */
export async function cancelRun(runId: string): Promise<{ cancelled: number; was_running: number; note: string | null }> {
  const res = await apiFetch(`/api/runs/${runId}/cancel`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, `/runs/${runId}/cancel`, await message(res));
  return res.json();
}

/** POST /api/jobs/{id}/cancel: a queued or running job. A running job stops at the worker's next lease extension. */
export async function cancelJob(jobId: string): Promise<{ was_running: boolean }> {
  const res = await apiFetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, `/jobs/${jobId}/cancel`, await message(res));
  return res.json();
}

/** POST /api/runs/{id}/retry: a new run for the failed and cancelled jobs, with the same method version and parameters. */
export async function retryRun(runId: string): Promise<RunDetail> {
  const res = await apiFetch(`/api/runs/${runId}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!res.ok) throw new ApiError(res.status, `/runs/${runId}/retry`, await message(res));
  return res.json();
}

async function message(res: Response): Promise<string> {
  try { const b = (await res.json()) as { detail: unknown }; return typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail); }
  catch { return `${res.status} ${res.statusText}`; }
}
