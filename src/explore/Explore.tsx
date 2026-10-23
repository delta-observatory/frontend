import { useEffect, useMemo, useRef, useState } from "react";
import { useAccess } from "../api/access";
import { getJson } from "../api/client";
import type { Page, RunDetail, RunSummary, TargetClass } from "../api/types";
import type { Base, Target } from "../data/catalogue";
import { loadEvidence, type Evidence } from "../data/evidence";
import { Inspector } from "../Inspector";
import { Fold } from "../plots/Fold";
import { LightCurve } from "../plots/LightCurve";
import { Periodogram } from "../plots/Periodogram";
import { boundRange, type Range } from "../plots/viewport";
import { RecordsPanel } from "../records/RecordsPanel";
import type { Selection } from "../records/Tables";
import type { RecordLists } from "../records/useRecords";
import { RunPanel } from "../runs/RunPanel";
import type { ExportSubject } from "../exports/ExportDialog";
import "./explore.css";

interface Signal {
  observation_id: string; dataset_id: string; target_id: string | null; sector: number; cadence_seconds: number;
  label_class: TargetClass | null; planet_name: string | null; job_id: string; run_id: string; run_label: string | null;
  method_id: string; method_version: number; period_days: number | null; depth: number | null; depth_snr: number | null;
  duration_days: number | null; observed_transit_count: number | null; candidate_ids: string[];
}
interface Props {
  base: Base | null; runs: RunSummary[] | null; records: RecordLists; person: boolean;
  refreshRuns: () => void; onStartedRun: (run: RunDetail) => void;
  onCompare: (runId: string) => void; onExport: (subject: ExportSubject) => void;
}
const number = (n: number | null, digits = 3) => n == null ? "—" : n.toFixed(digits);
function targetOf(s: Signal): Target {
  return { id: s.observation_id, tic: s.target_id ?? s.observation_id.slice(0, 8), sector: s.sector, cls: s.label_class,
    name: s.planet_name, refPeriod: null, ra: null, dec: null, v: null, tmag: null, period: s.period_days, depth: s.depth,
    snr: s.depth_snr, relErr: null, status: null, jobState: "complete", cadence: s.cadence_seconds };
}

export function Explore(p: Props) {
  const access = useAccess();
  const [sample, setSample] = useState(p.person ? "unconfirmed" : "all");
  const [query, setQuery] = useState("");
  const [dataset, setDataset] = useState("");
  const [sort, setSort] = useState("snr");
  const [runId, setRunId] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page<Signal> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [ev, setEv] = useState<Evidence | null>(null);
  const [evError, setEvError] = useState<string | null>(null);
  const [brush, setBrush] = useState<Range | null>(null);
  const [view, setView] = useState<Range | null>(null);
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [cursorP, setCursorP] = useState<number | null>(null);
  const [foldP, setFoldP] = useState<number | null>(null);
  const [periodText, setPeriodText] = useState("");
  const [fluxMode, setFluxMode] = useState<"normalized" | "flattened">("flattened");
  const [fullCycle, setFullCycle] = useState(false);
  const [side, setSide] = useState<"review" | "details" | "search">("review");
  const [record, setRecord] = useState<Selection>(null);
  const search = useRef<HTMLInputElement>(null);
  const states = JSON.stringify((p.runs ?? []).map((r) => [r.id, r.job_states]));
  useEffect(() => {
    let live = true;
    setLoading(true); setError(null);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ sample, sort, limit: "100", offset: String(offset) });
      if (query.trim()) params.set("q", query.trim());
      if (dataset) params.set("dataset_id", dataset);
      if (runId) params.set("run_id", runId);
      getJson<Page<Signal>>(`/signals?${params}`).then((data) => {
        if (!live) return;
        setPage(data); setLoading(false);
        setSelected((id) => data.items.some((s) => s.observation_id === id) ? id : data.items[0]?.observation_id ?? null);
      }, (e: Error) => { if (live) { setError(e.message); setPage(null); setLoading(false); } });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [sample, sort, query, dataset, runId, offset, revision, states]);
  const signals = page?.items ?? [];
  const signal = signals.find((s) => s.observation_id === selected) ?? null;
  const targets = useMemo(() => (page?.items ?? []).map(targetOf), [page]);
  const targetsById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const current = selected ? targetsById.get(selected) ?? null : null;
  const campaigns = useMemo(() => new Map((p.records.campaigns ?? []).map((c) => [c.id, c])), [p.records.campaigns]);
  const candidateMap = useMemo(() => new Map((p.records.candidates ?? []).map((c) => [c.id, c])), [p.records.candidates]);
  const run = p.runs?.find((r) => r.id === signal?.run_id) ?? null;
  const method = p.base?.methods.get(`${signal?.method_id}/${signal?.method_version}`) ?? [...(p.base?.methods.values() ?? [])].find((m) => m.id === "tess-bls") ?? null;
  useEffect(() => {
    let live = true;
    setEv(null); setEvError(null); setBrush(null); setView(null); setFoldP(null); setCursorT(null); setCursorP(null); setPeriodText("");
    setRecord(signal?.candidate_ids[0] ? { kind: "candidate", id: signal.candidate_ids[0] } : null);
    if (signal) loadEvidence(signal.observation_id, signal.run_id).then((e) => { if (live) setEv(e); }, (e: Error) => { if (live) setEvError(e.message); });
    return () => { live = false; };
    // A completed job is immutable. List refreshes must not reset chart interaction.
  }, [signal?.job_id]);
  const fresh = ev?.job.job_id === signal?.job_id ? ev : null;
  const index = signals.findIndex((s) => s.observation_id === selected);
  const step = (delta: number) => { const next = signals[index + delta]; if (next) setSelected(next.observation_id); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "j") step(1);
      if (e.key === "k") step(-1);
      if (e.key === "/") { e.preventDefault(); search.current?.focus(); }
      if (e.key === "Escape") { setBrush(null); setFoldP(null); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const changeFilter = (f: () => void) => { f(); setOffset(0); setPage(null); };
  const choosePeriod = (period: number | null) => { setFoldP(period); setPeriodText(period == null ? "" : String(period)); };
  const event = (direction: number) => {
    if (!fresh) return;
    const best = fresh.summary.best, period = foldP ?? best.period;
    const center = view ? (view[0] + view[1]) / 2 : fresh.checks.time_min;
    const n = direction > 0 ? Math.floor((center - best.transit_time) / period + 1e-8) + 1 : Math.ceil((center - best.transit_time) / period - 1e-8) - 1;
    const time = best.transit_time + n * period, half = Math.min(period / 2, Math.max(best.duration * 3, 0.15));
    setView(boundRange([time - half, time + half], [fresh.checks.time_min - 0.3, fresh.checks.time_max + 0.3]));
  };
  const refresh = () => { p.records.refresh(); setRevision((v) => v + 1); };
  const showRun = (id: string) => changeFilter(() => { setRunId(id); setSample("all"); setDataset(""); setQuery(""); });
  return <main className="explore">
    <aside className="signal-queue">
      <div className="explore-intro"><h1>Explore signals</h1><p>Inspect periodic dips from the box least squares (BLS) search.</p></div>
      <div className="queue-filters">
        <label>Sample<select aria-label="Signal sample" value={sample} onChange={(e) => changeFilter(() => setSample(e.target.value))}>
          {p.person && <option value="unconfirmed">Without known-planet or binary labels</option>}<option value="all">All searched observations</option><option value="candidates">Linked candidate records</option></select></label>
        <label>Target<input ref={search} aria-label="Find signal target" value={query} onChange={(e) => changeFilter(() => setQuery(e.target.value))} placeholder="Search TIC identifier" /></label>
        <label>Dataset<select aria-label="Signal dataset" value={dataset} onChange={(e) => changeFilter(() => setDataset(e.target.value))}><option value="">All datasets</option>{p.base?.datasets.map((d) => <option key={d.id}>{d.id}</option>)}</select></label>
        <label>Results<select aria-label="Signal run" value={runId} onChange={(e) => changeFilter(() => setRunId(e.target.value))}><option value="">Latest completed search per observation</option>{p.runs?.filter((r) => r.method_id === "tess-bls").map((r) => <option value={r.id} key={r.id}>{r.label ?? r.id.slice(0, 8)}</option>)}</select></label>
        <label>Order<select aria-label="Signal order" value={sort} onChange={(e) => changeFilter(() => setSort(e.target.value))}><option value="snr">Depth signal-to-noise ratio</option><option value="period">Period, shortest first</option><option value="depth">Depth, largest first</option><option value="recent">Most recent search</option></select></label>
      </div>
      <div className="queue-count" role="status">{loading ? "Loading signals…" : `${page?.total ?? 0} observations`}<button onClick={() => setRevision((v) => v + 1)}>Refresh</button></div>
      <p className="queue-note">Depth S/N is the depth signal-to-noise ratio. It is not a planet probability. Missing labels do not establish a new object.</p>
      <div className="signal-list" aria-label="Signal queue">
        {error && <div className="error-inline">{error}</div>}
        {!loading && !error && !signals.length && <div className="empty">No completed searches match these filters. Select another sample or run.</div>}
        {signals.map((s, i) => {
          const c = s.candidate_ids.map((id) => candidateMap.get(id)).find(Boolean);
          return <button key={s.observation_id} className={`signal-row${s.observation_id === selected ? " on" : ""}`} onClick={() => setSelected(s.observation_id)} aria-pressed={s.observation_id === selected}>
            <span className="signal-name"><b>{s.target_id ?? s.observation_id.slice(0, 8)}</b><span>S{s.sector}</span></span>
            <span className="signal-values">{i + offset + 1}. P {number(s.period_days)} d <b>S/N {number(s.depth_snr, 1)}</b></span>
            <span className="signal-record">{c ? `${c.label ?? "Candidate"} · ${c.evidence_status?.status ?? "unreviewed"}` : s.candidate_ids.length ? "Linked candidate" : s.planet_name ?? s.label_class?.replaceAll("_", " ") ?? "No candidate record"}</span>
          </button>;
        })}
      </div>
      <div className="queue-paging"><button disabled={!offset || loading} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous page</button><span>{page?.total ? `${offset + 1}–${offset + signals.length}` : "0"}</span><button disabled={loading || offset + signals.length >= (page?.total ?? 0)} onClick={() => setOffset(offset + 100)}>Next page</button></div>
    </aside>
    <section className="signal-workbench">
      <header className="signal-heading"><div><span className="eyebrow">OBSERVATION · {signal?.dataset_id ?? "—"}</span><h2>{signal?.target_id ?? (signal ? signal.observation_id.slice(0, 8) : "Select a signal")} {signal && <span>· Sector {signal.sector}</span>}</h2></div><div className="signal-nav">{signal?.target_id && <button onClick={() => changeFilter(() => setQuery(signal.target_id!))}>This target’s sectors</button>}<button disabled={index <= 0} onClick={() => step(-1)}>← Previous</button><button disabled={index < 0 || index >= signals.length - 1} onClick={() => step(1)}>Next →</button></div></header>
      {signal && <div className="signal-metrics"><span>PERIOD<b>{number(signal.period_days, 6)} <small>d</small></b></span><span>DEPTH<b>{number(signal.depth == null ? null : signal.depth * 1e6, 0)} <small>ppm</small></b></span><span>DURATION<b>{number(signal.duration_days == null ? null : signal.duration_days * 24, 2)} <small>h</small></b></span><span>DEPTH S/N<b>{number(signal.depth_snr, 1)}</b></span><span>EVENTS<b>{number(signal.observed_transit_count, 0)}</b></span></div>}
      {fresh ? <>
        <div className="chart-tools"><label>Flux<select aria-label="Flux display" value={fluxMode} onChange={(e) => setFluxMode(e.target.value as typeof fluxMode)}><option value="flattened">Flattened</option><option value="normalized">Normalized + trend</option></select></label><button disabled={!brush} onClick={() => brush && setView(boundRange(brush, [fresh.checks.time_min - 0.3, fresh.checks.time_max + 0.3]))}>Zoom selection</button><button onClick={() => { setView(null); setBrush(null); }}>Reset time</button><button onClick={() => event(-1)}>← Event</button><button onClick={() => event(1)}>Event →</button>{brush && <button onClick={() => setBrush(null)}>Clear selection</button>}</div>
        <div className="explore-light"><LightCurve ev={fresh} brush={brush} cursorT={cursorT} foldP={foldP} onBrush={setBrush} onCursorT={setCursorT} view={view} onView={setView} fluxMode={fluxMode} /></div>
        <div className="chart-hint">Wheel: zoom · Shift + drag: move time · Drag: select times for the fold · Double-click: reset time{view && <span> · View {view[0].toFixed(3)}–{view[1].toFixed(3)} d</span>}</div>
        <div className="fold-tools"><button className={!foldP ? "on" : ""} onClick={() => choosePeriod(null)}>Stored P</button><button onClick={() => choosePeriod(fresh.summary.best.period / 2)}>P/2</button><button onClick={() => choosePeriod(fresh.summary.best.period * 2)}>2P</button><form onSubmit={(e) => { e.preventDefault(); const value = Number(periodText); if (Number.isFinite(value) && value >= 0.01 && value <= 10000) choosePeriod(value); }}><label>Display period <input aria-label="Display period" type="number" min="0.01" max="10000" step="any" value={periodText} placeholder={fresh.summary.best.period.toFixed(6)} onChange={(e) => setPeriodText(e.target.value)} /> d</label><button type="submit">Fold</button></form><label><input type="checkbox" checked={fullCycle} onChange={(e) => setFullCycle(e.target.checked)} /> Full cycle</label></div>
        <div className="explore-plots"><Periodogram ev={fresh} foldP={foldP} cursorP={cursorP} onFoldP={choosePeriod} onCursorP={setCursorP} /><Fold ev={fresh} brush={brush} cursorT={cursorT} foldP={foldP} fullCycle={fullCycle} /></div>
        <div className="peak-tools"><span>Stored peaks:</span>{fresh.summary.peaks.map((pk, i) => <button key={i} onClick={() => choosePeriod(pk.period)}>{i + 1} · {pk.period.toFixed(4)} d</button>)}</div>
        <footer className="signal-source">{signal?.method_id} v{signal?.method_version} · run {signal?.run_id.slice(0, 8)} · job {signal?.job_id.slice(0, 8)}<br />{signal?.run_label ?? "Stored search"}. Display folds do not change this result.</footer>
      </> : <div className={evError ? "error-inline" : "empty"}>{evError ?? (signal ? "Loading the result artifacts…" : "Select an observation with a completed search.")}</div>}
    </section>
    <aside className="explore-side"><nav className="explore-side-tabs">{(["review", "details", "search"] as const).map((s) => <button key={s} className={side === s ? "on" : ""} onClick={() => setSide(s)}>{s === "search" ? "Run search" : s[0]!.toUpperCase() + s.slice(1)}</button>)}</nav>
      {side === "review" && <><div className="review-actions"><p>Candidate records refer to this observation. Their evidence can differ from the chart run.</p>{signal?.candidate_ids.map((id) => <button key={id} className={record?.kind === "candidate" && record.id === id ? "on" : ""} onClick={() => setRecord({ kind: "candidate", id })}>{candidateMap.get(id)?.label ?? id.slice(0, 8)}</button>)}<button disabled={!fresh || !access.records} onClick={() => setRecord({ kind: "new-candidate" })}>New candidate from this result</button></div>{p.records.error && <div className="error-inline">{p.records.error}</div>}{!record && <div className="empty">No candidate record is selected. Create a record to retain this result for review.</div>}{p.base && record && <RecordsPanel key={signal?.job_id ?? "none"} selection={record} campaigns={campaigns} tasks={p.records.tasks} targetsById={targetsById} methods={p.base.methods} current={current} evidence={fresh} now={Date.now()} onSelect={setRecord} onDetail={() => {}} onExport={p.onExport} onChanged={refresh} />}</>}
      {side === "details" && (current ? <Inspector target={current} observation={fresh?.observation ?? null} ev={fresh} method={method} run={run} loading={!fresh && !evError} error={evError} changeMs={null} onNewCandidate={() => { setSide("review"); setRecord({ kind: "new-candidate" }); }} /> : <div className="empty">Select a signal.</div>)}
      {side === "search" && method && <RunPanel method={method} runs={p.runs} activeRunId={runId || signal?.run_id || null} selected={current} matches={targets} matchesLabel="This queue page" targetsById={targetsById} onShow={showRun} refreshRuns={p.refreshRuns} onStartedRun={(r) => { p.onStartedRun(r); showRun(r.id); }} onCompare={p.onCompare} onExport={(r) => p.onExport({ kind: "run", id: r.id, label: r.label ?? r.id.slice(0, 8) })} />}
    </aside>
  </main>;
}
