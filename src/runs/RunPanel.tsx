import { Fragment, useEffect, useMemo, useState } from "react";
import { canCancel, denied, useAccess } from "../api/access";
import type { MethodInfo, RunDetail, RunEstimate, RunSummary } from "../api/types";
import type { Target } from "../data/catalogue";
import { check, failedConstraints, fields, getAt, parse, setAt, toText, type Field } from "./params";
import { cancelJob, cancelRun, estimateRun, retryRun, submitRun, useRunDetail } from "./useRuns";

interface Props {
  method: MethodInfo;
  runs: RunSummary[] | null;
  activeRunId: string | null;
  selected: Target | null;
  matches: Target[];
  targetsById: Map<string, Target>;
  onShow: (runId: string) => void;
  refreshRuns: () => void;
  onStartedRun: (run: RunDetail) => void;
  onCompare: (runId: string) => void;
  onExport: (run: RunSummary) => void;
}

const STATES = ["complete", "inconclusive", "failed", "cancelled", "running", "queued"] as const;
const label = (k: string) => k.replace(/_/g, " ");
const unitText = (u?: string) => (u && u !== "1" ? u : "");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const duration = (s: number) => (s < 90 ? `${s.toFixed(0)} s` : s < 5400 ? `${(s / 60).toFixed(1)} min` : `${(s / 3600).toFixed(1)} h`);

export function RunPanel(p: Props) {
  const [watch, setWatch] = useState<string | null>(null);
  const analysisRuns = (p.runs ?? []).filter((r) => r.method_id === p.method.id && r.method_version === p.method.version);
  return (
    <div className="scroll"><div className="ibody run-panel">
      <RunForm {...p} onStarted={(run) => { setWatch(run.id); p.onStartedRun(run); }} />
      <h3>Runs · <span className="id">{p.method.id} v{p.method.version}</span></h3>
      {p.runs == null && <div className="empty">Loading the runs…</div>}
      {analysisRuns.map((r) => (
        <RunRow key={r.id} run={r} method={p.method} active={r.id === p.activeRunId} open={r.id === watch} targetsById={p.targetsById}
          onToggle={() => setWatch(watch === r.id ? null : r.id)} onShow={() => p.onShow(r.id)} refreshRuns={p.refreshRuns}
          onCompare={() => p.onCompare(r.id)} onExport={() => p.onExport(r)} onRetried={(run) => { setWatch(run.id); p.onStartedRun(run); }} />
      ))}
    </div></div>
  );
}

function RunForm(p: Props & { onStarted: (run: RunDetail) => void }) {
  const all = useMemo(() => fields(p.method.parameters_schema), [p.method]);
  const [params, setParams] = useState<Record<string, unknown>>(() => structuredClone(p.method.defaults));
  const [text, setText] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [scope, setScope] = useState<"selected" | "matches">("selected");
  const [runLabel, setRunLabel] = useState("");
  const [serverErrors, setServerErrors] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refused = denied(useAccess(), "runs");

  const inputs = scope === "selected" ? (p.selected ? [p.selected] : []) : p.matches;
  const parseErrors = new Map<string, string>();
  for (const f of all) { const t = text[f.key]; if (t != null) { const r = parse(t, f.schema); if ("error" in r) parseErrors.set(f.key, r.error); } }
  const rangeErrors = new Map<string, string>();
  for (const f of all) { const m = check(getAt(params, f.path), f.schema); if (m.length) rangeErrors.set(f.key, m.join(", ")); }
  const ruleErrors = failedConstraints(p.method.constraints, params);
  const ruleByPath = new Map<string, string>();
  for (const r of ruleErrors) for (const path of r.paths) ruleByPath.set(path, r.rule);
  const errorOf = (k: string) => parseErrors.get(k) ?? rangeErrors.get(k) ?? (ruleByPath.has(k) ? `rule: ${ruleByPath.get(k)}` : null) ?? serverErrors.get(k) ?? null;
  const blocked = parseErrors.size + rangeErrors.size + ruleErrors.length > 0 || inputs.length === 0;

  // Work estimate and authoritative checks from POST /api/runs/estimate, 0.3 s after the last change.
  const [estimate, setEstimate] = useState<RunEstimate["estimate"]>(null);
  const requestKey = JSON.stringify([p.method.id, p.method.version, params, inputs.map((t) => t.id)]);
  useEffect(() => {
    if (blocked) { setEstimate(null); return; }
    let live = true;
    const id = window.setTimeout(() => {
      estimateRun({ method: { id: p.method.id, version: p.method.version }, parameters: params, observation_ids: inputs.map((t) => t.id) }).then(
        (r) => { if (!live) return; if (r.ok) { setEstimate(r.estimate.estimate); setServerErrors(new Map()); } else { setEstimate(null); setServerErrors(r.fieldErrors); } },
        () => { if (live) setEstimate(null); });
    }, 300);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, blocked]);

  const edit = (f: Field, t: string) => {
    setText({ ...text, [f.key]: t });
    setServerErrors(new Map());
    const r = parse(t, f.schema);
    if ("value" in r) setParams(setAt(params, f.path, r.value));
  };
  const reset = (f: Field) => {
    const { [f.key]: _, ...rest } = text;
    setText(rest);
    setParams(setAt(params, f.path, structuredClone(getAt(p.method.defaults, f.path))));
  };
  const resetAll = () => { setText({}); setParams(structuredClone(p.method.defaults)); setServerErrors(new Map()); setMessage(null); };

  const start = async () => {
    setBusy(true); setMessage(null);
    try {
      const r = await submitRun({ method: { id: p.method.id, version: p.method.version }, parameters: params, observation_ids: inputs.map((t) => t.id), ...(runLabel.trim() ? { label: runLabel.trim() } : {}) });
      if (r.ok) { setMessage(`Run ${r.run.id.slice(0, 8)} started with ${r.run.jobs.length} job${r.run.jobs.length === 1 ? "" : "s"}.`); p.onStarted(r.run); }
      else { setServerErrors(r.fieldErrors); setMessage(r.message); }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };

  const cadence = p.selected?.cadence ?? 120;
  let lastGroup: string | null | undefined;
  return (
    <>
      <h3>New run · <span className="id">{p.method.id} v{p.method.version}</span></h3>
      <div className="run-method">{p.method.summary}. <span className="provisional">{p.method.scientific_status}</span></div>
      <div className="run-scope">
        <label className={scope === "selected" ? "on" : ""}><input type="radio" checked={scope === "selected"} onChange={() => setScope("selected")} />
          Selected target <b>{p.selected ? p.selected.name ?? p.selected.tic : "none"}</b></label>
        <label className={scope === "matches" ? "on" : ""}><input type="radio" checked={scope === "matches"} onChange={() => setScope("matches")} />
          Search matches <b>{p.matches.length}</b></label>
      </div>
      <input className="run-label" placeholder="Label (optional), for example: maximum period 20 d" value={runLabel} onChange={(e) => setRunLabel(e.target.value)} maxLength={200} />
      <div className="params">
        {all.map((f) => {
          const header = f.group !== lastGroup ? (lastGroup = f.group, f.group) : null;
          const value = getAt(params, f.path), changed = !same(value, getAt(p.method.defaults, f.path)), err = errorOf(f.key);
          const unit = unitText(f.schema["x-unit"]);
          const hint = f.schema["x-unit"] === "cadence" && typeof value === "number" ? `≈ ${((value * cadence) / 86400).toFixed(2)} d at ${cadence.toFixed(0)} s` : null;
          return (
            <Fragment key={f.key}>
              {header && <div className="param-group" title={f.groupDescription}>{label(header)}</div>}
              <div className={`param${changed ? " changed" : ""}${err ? " bad" : ""}`}>
                <span className="param-name" title={f.schema.description}>{label(f.path[f.path.length - 1]!)}</span>
                {f.schema.enum ? (
                  <select value={String(value)} onChange={(e) => edit(f, e.target.value)} onFocus={() => setFocus(f.key)}>
                    {f.schema.enum.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
                  </select>
                ) : (
                  <input inputMode={f.schema.type === "array" ? "text" : "decimal"} value={text[f.key] ?? toText(value)} onChange={(e) => edit(f, e.target.value)} onFocus={() => setFocus(f.key)} spellCheck={false} />
                )}
                <span className="param-unit">{unit}</span>
                <button className="param-reset" disabled={!changed} onClick={() => reset(f)} title="Reset to the default">↺</button>
                {(focus === f.key || err || hint) && (
                  <div className="param-note">
                    {err && <span className="err">{err}</span>}
                    {hint && <span>{hint}</span>}
                    {focus === f.key && <span>{f.schema.description} Default: {toText(getAt(p.method.defaults, f.path))}{unit ? ` ${unit}` : ""}.</span>}
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
      {estimate && estimate.trials && (
        <div className={`estimate${estimate.over_limit ? " warn" : ""}`}>
          <span>{inputs.length} job{inputs.length === 1 ? "" : "s"} · {estimate.trials.min === estimate.trials.max ? estimate.trials.min.toLocaleString("en-US") : `${estimate.trials.min.toLocaleString("en-US")}–${estimate.trials.max.toLocaleString("en-US")}`} trial periods each (estimate) · limit {estimate.limit.toLocaleString("en-US")}</span>
          {estimate.worker_seconds != null && estimate.seconds_per_trial && <span>≈ {duration(estimate.worker_seconds)} of worker time, from the median rate of {estimate.seconds_per_trial.jobs} measured job{estimate.seconds_per_trial.jobs === 1 ? "" : "s"}</span>}
          {estimate.over_limit > 0 && <span className="err">{estimate.over_limit} light curve{estimate.over_limit === 1 ? "" : "s"} exceed the trial limit. The worker stops those jobs before the search.</span>}
        </div>
      )}
      {message && <div className={serverErrors.size || message.startsWith("4") || message.startsWith("5") ? "error-inline" : "ok-inline"}>{message}</div>}
      {refused && <div className="empty">{refused}</div>}
      <div className="run-actions">
        <button onClick={resetAll}>Reset all</button>
        <button className="primary" disabled={blocked || busy || refused != null} title={refused ?? undefined} onClick={start}>{busy ? "Starting…" : `Start run · ${inputs.length} job${inputs.length === 1 ? "" : "s"}`}</button>
      </div>
    </>
  );
}

function StateBar({ states, total }: { states: Record<string, number>; total: number }) {
  return (
    <div className="statebar" title={STATES.filter((s) => states[s]).map((s) => `${s} ${states[s]}`).join(" · ")}>
      {STATES.map((s) => (states[s] ? <i key={s} className={`st-${s}`} style={{ flexGrow: states[s] }} /> : null))}
      {total === 0 && <i className="st-queued" style={{ flexGrow: 1 }} />}
    </div>
  );
}

interface RowProps {
  run: RunSummary; method: MethodInfo; active: boolean; open: boolean; targetsById: Map<string, Target>;
  onToggle: () => void; onShow: () => void; refreshRuns: () => void; onCompare: () => void; onExport: () => void; onRetried: (run: RunDetail) => void;
}

function RunRow({ run, method, active, open, targetsById, onToggle, onShow, refreshRuns, onCompare, onExport, onRetried }: RowProps) {
  const detail = useRunDetail(run.id, open ? JSON.stringify(run.job_states) : "");
  const [note, setNote] = useState<string | null>(null);
  const queued = run.job_states.queued ?? 0, running = run.job_states.running ?? 0, done = run.input_count - queued - running;
  const retryable = (run.job_states.failed ?? 0) + (run.job_states.cancelled ?? 0);
  const access = useAccess();
  const cancellable = canCancel(access, run);
  const act = async (f: () => Promise<string>) => { try { setNote(await f()); } catch (e) { setNote((e as Error).message); } refreshRuns(); };
  const changed = detail ? fields(method.parameters_schema).filter((f) => !same(getAt(detail.parameters, f.path), getAt(method.defaults, f.path))) : [];
  return (
    <div className={`run${active ? " active" : ""}`}>
      <div className="run-head" onClick={onToggle}>
        <span className="run-title"><b>{run.label || (run.text_withheld ? "Label withheld" : "No label")}</b><span className="mono">{run.id.slice(0, 8)} · {when(run.created_at)}{run.retry_of ? ` · retry of ${run.retry_of.slice(0, 8)}` : ""}</span></span>
        <span className="run-count mono">{done}/{run.input_count}</span>
      </div>
      <StateBar states={run.job_states} total={run.input_count} />
      <div className="run-params mono">
        {detail == null ? "…" : changed.length === 0 ? "defaults" : changed.map((f) => `${f.key} ${toText(getAt(detail.parameters, f.path))}${unitText(f.schema["x-unit"]) ? ` ${f.schema["x-unit"]}` : ""}`).join(" · ")}
      </div>
      <div className="run-actions">
        {active ? <span className="run-active">Shown</span> : <button onClick={onShow} disabled={(run.job_states.complete ?? 0) === 0}>Show results</button>}
        {queued + running > 0 && cancellable && <button onClick={() => act(async () => { const r = await cancelRun(run.id); return `${r.cancelled} cancelled, ${r.was_running} of them running${r.note ? `. ${r.note}` : ""}`; })}>Cancel run</button>}
        {retryable > 0 && queued + running === 0 && access.runs && <button onClick={() => act(async () => { const r = await retryRun(run.id); onRetried(r); return `Retry run ${r.id.slice(0, 8)} with ${r.jobs.length} jobs`; })}>Retry failed and cancelled ({retryable})</button>}
        <button onClick={onToggle}>{open ? "Hide jobs" : "Jobs"}</button>
        <button onClick={onCompare}>Compare with…</button>
        <button onClick={onExport}>Export…</button>
        {note && <span className="mono">{note}</span>}
      </div>
      {open && detail && (
        <table className="jobs">
          <tbody>
            {detail.jobs.map((j) => {
              const t = targetsById.get(j.observation_id);
              const secs = j.started_at ? ((j.finished_at ? Date.parse(j.finished_at) : Date.now()) - Date.parse(j.started_at)) / 1000 : null;
              return (
                <Fragment key={j.id}>
                  <tr>
                    <td className="nm">{t?.name ?? t?.tic ?? j.observation_id.slice(0, 8)}</td>
                    <td><span className={`state st-${j.state}`}>{j.state}</span></td>
                    <td className="n">{j.attempts}/{j.max_attempts}</td>
                    <td className="n">{secs == null ? "—" : `${secs.toFixed(1)} s`}</td>
                    <td>{(j.state === "queued" || j.state === "running") && cancellable && <button className="x" onClick={() => act(async () => { const r = await cancelJob(j.id); return r.was_running ? "Cancelled a running job. The worker stops it at its next lease extension." : "Cancelled a queued job."; })}>cancel</button>}</td>
                  </tr>
                  {j.error && (j.state === "failed" || j.state === "inconclusive") && (
                    <tr className="job-err"><td colSpan={5}><b>{j.state} · {j.error.kind ?? "error"}</b> · {j.error.message ?? "message withheld"}</td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {open && (
        <div className="run-limits">
          Cancel of a running job: the worker stops the method at its next lease extension, at most one third of the lease later, and discards the output of that attempt. Its worker time is not recorded.
          A failed job does not retry by itself. Retry creates a new run for the failed and cancelled jobs. Completed jobs are not repeated.
          A method does not resume partial work. A worker restart returns its running job to the queue, and the next attempt starts again.
        </div>
      )}
    </div>
  );
}
