import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Catalogue, type Segment } from "./Catalogue";
import { getJson, session } from "./api/client";
import type { Campaign, Candidate, CandidateDetail } from "./api/records";
import { ComparePanel, CompareSide, useComparison } from "./compare/ComparePanel";
import { ExportDialog, type ExportSubject } from "./exports/ExportDialog";
import { RecordsPanel } from "./records/RecordsPanel";
import { CandidateTable, candidateTarget, TaskTable, type Selection } from "./records/Tables";
import { useRecords } from "./records/useRecords";
import { filterCandidates, NO_FILTER, type CandidateFilter } from "./records/view";
import { getObservation, loadBase, loadDefaultRun, loadTargets, type Base, type Target } from "./data/catalogue";
import type { ObservationDetail, RunSummary } from "./api/types";
import { RunPanel } from "./runs/RunPanel";
import { useRuns } from "./runs/useRuns";
import { loadEvidence, prefetchEvidence, type Evidence } from "./data/evidence";
import { Inspector } from "./Inspector";
import { useCompact } from "./layout";
import { Fold } from "./plots/Fold";
import { LightCurve } from "./plots/LightCurve";
import { Periodogram } from "./plots/Periodogram";
import { parseSearch, type ClassFilter } from "./data/search";
import { motion, useMotion } from "./motion";
import { marks } from "./perf/frames";
import { AllSky } from "./sky/AllSky";
import { RunsHolding } from "./runs/RunsHolding";
import { camera } from "./sky/camera";
import type { StarColumns } from "./sky/layers";
import { SkyBoundary, SkyUnavailable } from "./sky/SkyError";
import { SkyView } from "./sky/SkyView";
import { webgl2Status } from "./sky/webgl";

const WEBGL = webgl2Status();

async function getStatic<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: GET ${path}`);
  return (await res.json()) as T;
}

type Tab = "targets" | "light" | "pgram" | "fold" | "details" | "run" | "records" | "compare";
const TABS: [Tab, string][] = [["targets", "Targets"], ["light", "Curve"], ["pgram", "Pgram"], ["fold", "Fold"], ["details", "Details"], ["run", "Run"], ["records", "Records"], ["compare", "Compare"]];
type Workspace = "sky" | "analysis" | "evidence";
type Side = "details" | "run" | "records" | "compare";

/** The time, once a second while `on`. Lease countdowns use it. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [on]);
  return now;
}

export function App() {
  const [base, setBase] = useState<Base | null>(null);
  const [me, setMe] = useState<{ name: string; kind: string } | null>(null);
  const { runs, refresh: refreshRuns, expect: expectRun } = useRuns();
  // The run that the sky, plots, and measurements show. This browser remembers the choice.
  const [activeRunId, setActiveRunIdState] = useState<string | null>(() => { try { return localStorage.getItem("delta.activeRun"); } catch { return null; } });
  const setActiveRunId = (id: string) => { setActiveRunIdState(id); try { localStorage.setItem("delta.activeRun", id); } catch { /* The choice stays for this page only. */ } };
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetsLoadMs, setTargetsLoadMs] = useState<number | null>(null);
  // Undefined until the API answers. Null when no analysis run has a complete job.
  const [defaultRun, setDefaultRun] = useState<RunSummary | null | undefined>(undefined);
  const [observation, setObservation] = useState<ObservationDetail | null>(null);
  const [side, setSide] = useState<Side>("details");
  const [workspace, setWorkspace] = useState<Workspace>("sky");
  const [segment, setSegment] = useState<Segment>("targets");
  const [record, setRecord] = useState<Selection>(null);
  // The run of a candidate's job evidence. The workbench shows it without a change to the stored run choice.
  const [focusRunId, setFocusRunId] = useState<string | null>(null);
  const [cmpA, setCmpA] = useState<string | null>(null);
  const [cmpB, setCmpB] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportSubject | null>(null);
  const [candFilter, setCandFilter] = useState<CandidateFilter>(NO_FILTER);
  const [error, setError] = useState<string | null>(null);
  const [stars, setStars] = useState<StarColumns | null>(null);
  const [lines, setLines] = useState<number[][] | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState<ClassFilter>("all");
  const [firstSky, setFirstSky] = useState<number | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [evError, setEvError] = useState<string | null>(null);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [cursorP, setCursorP] = useState<number | null>(null);
  const [foldP, setFoldP] = useState<number | null>(null);
  const [changeMs, setChangeMs] = useState<number | null>(null);
  const changeStart = useRef<number | null>(null);
  const mode = useMotion();
  const skyCell = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const compact = useCompact();
  const [tab, setTab] = useState<Tab>("targets");
  // The tab strip scrolls on a phone. The active tab stays in view.
  useEffect(() => { if (compact) document.querySelector(".mtabs button.on")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [compact, tab]);

  useEffect(() => {
    loadBase().then(setBase, (e: Error) => setError(e.message));
    getJson<{ name: string; kind: string }>("/me").then(setMe, () => {});
    getStatic<StarColumns>("/sky/stars.json").then(setStars, (e: Error) => setError(e.message));
    getStatic<{ lines: { points: number[] }[] }>("/sky/constellations.json").then((c) => setLines(c.lines.map((l) => l.points)), (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (firstSky != null) return;
    const id = setInterval(() => { if (marks.firstSky != null) { setFirstSky(marks.firstSky); clearInterval(id); } }, 100);
    return () => clearInterval(id);
  }, [firstSky]);

  // Without a remembered choice, the API selects the run (rule default-run/1).
  useEffect(() => {
    if (!base) return;
    loadDefaultRun(base.dataset?.id ?? null).then(setDefaultRun, (e: Error) => setError(e.message));
  }, [base]);
  // The active run: the choice in the run panel, or the API default.
  const activeRun = useMemo(() => {
    if (!runs || !base) return null;
    return runs.find((r) => r.id === activeRunId) ?? (defaultRun ? runs.find((r) => r.id === defaultRun.id) ?? defaultRun : null);
  }, [runs, base, activeRunId, defaultRun]);
  // Keep the first default. A run that completes later does not replace the results on screen.
  useEffect(() => { if (activeRun && activeRun.id !== activeRunId) setActiveRunIdState(activeRun.id); }, [activeRunId, activeRun]);
  // Results reload when the job states of the active run change, so a running run fills in.
  const runKey = activeRun ? `${activeRun.id}:${JSON.stringify(activeRun.job_states)}` : "";
  // Targets, positions, values, and statuses come from GET /api/targets for the active run.
  useEffect(() => {
    if (!base || runs == null || (activeRunId == null && defaultRun === undefined)) return;
    let live = true;
    loadTargets(activeRun?.id ?? null, base.dataset?.id ?? null).then(
      (r) => { if (live) { setTargets(r.targets); setTargetsLoadMs(r.loadMs); } },
      (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, runKey]);
  const runId = activeRun?.id ?? null;
  const targetsById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const method = activeRun && base ? base.methods.get(`${activeRun.method_id}/${activeRun.method_version}`) ?? null : base ? [...base.methods.values()].find((m) => m.kind === "analysis") ?? null : null;
  const showRun = (id: string) => { setActiveRunId(id); setFocusRunId(null); setEvidence(null); };
  // Research records load after the sky and the catalogue.
  const recordLists = useRecords(targets.length > 0);
  const campaigns = useMemo(() => new Map<string, Campaign>((recordLists.campaigns ?? []).map((c) => [c.id, c])), [recordLists.campaigns]);
  const flagged = useMemo(() => new Set((recordLists.candidates ?? []).flatMap((c) => c.observation_ids)), [recordLists.candidates]);
  const now = useNow((recordLists.tasks ?? []).some((t) => t.state === "claimed"));
  const analysisRuns = useMemo(() => (runs ?? []).filter((r) => base?.methods.get(`${r.method_id}/${r.method_version}`)?.kind === "analysis"), [runs, base]);
  const comparison = useComparison(workspace === "analysis" || tab === "compare" ? cmpA : null, workspace === "analysis" || tab === "compare" ? cmpB : null,
    JSON.stringify([analysisRuns.find((r) => r.id === cmpA)?.job_states, analysisRuns.find((r) => r.id === cmpB)?.job_states]));
  const search = useMemo(() => parseSearch(query, cls), [query, cls]);
  // The API order (depth S/N, highest first) stays. The search only removes rows.
  const rows = useMemo(() => targets.filter(search.test), [targets, search]);
  const matches = useMemo(() => new Set(rows.map((t) => t.id)), [rows]);
  const current = targets.find((t) => t.id === selected) ?? null;

  const select = (id: string, keepFocus = false) => {
    const t = targets.find((x) => x.id === id);
    if (id !== selected) { changeStart.current = performance.now(); setBrush(null); setFoldP(null); setCursorT(null); }
    if (!keepFocus) setFocusRunId(null);
    setSelected(id);
    if (t?.v && workspace === "sky") camera.flyTo(t.v, motion.get() === "animated");
  };
  const openCandidate = (c: Candidate) => {
    setRecord({ kind: "candidate", id: c.id });
    if (compact) setTab("records"); else setSide("records");
    const first = c.observation_ids.find((o) => targetsById.has(o));
    if (first) select(first, true);
  };
  // The run of the candidate's first job evidence. A measurement reference names its job, and the job names its run.
  const onCandidateDetail = useCallback((d: CandidateDetail) => {
    const job = d.evidence.find((r) => r.kind === "job" && r.record && "run_id" in r.record)?.record as { run_id: string } | undefined;
    const fromMeasurement = d.evidence.find((r) => r.kind === "measurement" && r.record && "job_id" in r.record)?.record as { job_id: string } | undefined;
    const apply = (run: string | null) => setFocusRunId(run && run !== runId ? run : null);
    if (job) apply(job.run_id);
    else if (fromMeasurement) getJson<{ run_id: string }>(`/jobs/${fromMeasurement.job_id}`).then((j) => apply(j.run_id), () => apply(null));
    else apply(null);
  }, [runId]);
  const openCompare = (other: string) => {
    const a = activeRun?.id ?? null, b = other === a ? analysisRuns.find((r) => r.id !== a && (r.job_states.complete ?? 0) > 0)?.id ?? null : other;
    setCmpA(a); setCmpB(b);
    if (compact) setTab("compare"); else { setWorkspace("analysis"); setSide("compare"); }
  };
  // Default comparison: the shown run and the newest other analysis run with a complete job.
  useEffect(() => {
    if (cmpA || !activeRun) return;
    setCmpA(activeRun.id);
    setCmpB(analysisRuns.find((r) => r.id !== activeRun.id && r.method_id === activeRun.method_id && (r.job_states.complete ?? 0) > 0)?.id ?? null);
  }, [activeRun, analysisRuns, cmpA]);

  // The observation record of the selected target, for the inspector.
  useEffect(() => {
    if (!selected) { setObservation(null); return; }
    let live = true;
    getObservation(selected).then((o) => { if (live) setObservation(o); }, () => {});
    return () => { live = false; };
  }, [selected]);

  // Loads the result artifacts of the selected target. A newer selection replaces an older load.
  const evRunId = focusRunId ?? runId;
  useEffect(() => {
    if (!selected || !evRunId) return;
    let live = true;
    setEvError(null);
    loadEvidence(selected, evRunId).then((ev) => { if (live) setEvidence(ev); }, (e: Error) => { if (live) setEvError(e.message); });
    return () => { live = false; };
    // The run key reloads a target whose job finishes while the run is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, evRunId, runKey]);
  // Fold A and fold B of the selected target in the ANALYSIS workspace.
  const [evA, setEvA] = useState<Evidence | null>(null), [evB, setEvB] = useState<Evidence | null>(null);
  const [cmpErr, setCmpErr] = useState<[string | null, string | null]>([null, null]);
  useEffect(() => {
    if (workspace !== "analysis" || !selected) return;
    let live = true;
    setCmpErr([null, null]);
    if (cmpA) loadEvidence(selected, cmpA).then((e) => { if (live) setEvA(e); }, (e: Error) => { if (live) { setEvA(null); setCmpErr((x) => [e.message, x[1]]); } });
    if (cmpB) loadEvidence(selected, cmpB).then((e) => { if (live) setEvB(e); }, (e: Error) => { if (live) { setEvB(null); setCmpErr((x) => [x[0], e.message]); } });
    return () => { live = false; };
  }, [workspace, selected, cmpA, cmpB]);

  // Time from a target change to the first frame with its plots.
  useEffect(() => {
    if (!evidence || changeStart.current == null) return;
    const t0 = changeStart.current;
    requestAnimationFrame(() => requestAnimationFrame(() => { setChangeMs(performance.now() - t0); changeStart.current = null; }));
  }, [evidence]);
  // During a load, the plots keep the previous result, dim and labelled, so that the workbench does not go blank.
  const fresh = evidence && evidence.observation.id === selected && evidence.runId === evRunId ? evidence : null;
  const shownTarget = evidence ? targets.find((t) => t.id === evidence.observation.id) ?? null : null;

  // Loads in advance: the next and previous rows after each selection.
  useEffect(() => {
    if (!runId || !fresh) return;
    const i = rows.findIndex((t) => t.id === fresh.observation.id);
    for (const t of [rows[i + 1], rows[i - 1]]) if (t?.jobState === "complete") prefetchEvidence(t.id, runId);
  }, [runId, fresh, rows]);

  // Loads in advance when the pointer rests on a marker or a row for 120 ms.
  useEffect(() => {
    if (!runId || !hover || targetsById.get(hover)?.jobState !== "complete") return;
    const id = setTimeout(() => prefetchEvidence(hover, runId), 120);
    return () => clearTimeout(id);
  }, [runId, hover, targetsById]);

  // Keys: / search, j and k next and previous, f turn to the selection, + and − zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) { setBrush(null); setFoldP(null); return; }
      if (e.target instanceof HTMLInputElement) {
        if (e.key === "Escape" || e.key === "Enter") e.target.blur();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchInput.current?.focus(); }
      else if (e.key === "j") step(1);
      else if (e.key === "k") step(-1);
      else if (e.key === "f" && current?.v) camera.flyTo(current.v, motion.get() === "animated");
      else if (e.key === "+" || e.key === "=") camera.zoomBy(1 / 1.25);
      else if (e.key === "-") camera.zoomBy(1.25);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const step = (d: 1 | -1) => {
    if (!rows.length) return;
    const i = rows.findIndex((t) => t.id === selected);
    select((d > 0 ? rows[i + 1] ?? rows[0] : i > 0 ? rows[i - 1] : rows[rows.length - 1])!.id);
  };

  const onRule = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const top = el.parentElement!.getBoundingClientRect().top + (compact ? 40 : 31);
    const move = (ev: PointerEvent) => document.documentElement.style.setProperty(compact ? "--sky-h-compact" : "--sky-h", `${Math.min(Math.max(ev.clientY - top, 140), innerHeight - 220)}px`);
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const run = activeRun;
  const runPanel = base && method ? (
    <RunPanel method={method} runs={runs} activeRunId={activeRun?.id ?? null} selected={current} matches={rows} targetsById={targetsById}
      onShow={showRun} refreshRuns={refreshRuns} onStartedRun={expectRun} onCompare={openCompare}
      onExport={(r) => setExporting({ kind: "run", id: r.id, label: r.label ?? r.id.slice(0, 8) })} />
  ) : <div className="empty">Loading…</div>;
  const sky = WEBGL.ok ? (
    <SkyBoundary>
      <SkyView targets={targets} stars={stars} lines={lines} hover={hover} selected={selected} matches={matches} onHover={setHover} onSelect={select} flagged={flagged} />
    </SkyBoundary>
  ) : <SkyUnavailable reason={WEBGL.reason} />;
  const candidateTable = (wide: boolean, list: Candidate[] | null) => (
    <CandidateTable list={list} targetsById={targetsById} campaigns={campaigns} selected={record} wide={wide} onSelect={openCandidate} />
  );
  const taskTable = (
    <TaskTable list={recordLists.tasks} selected={record} now={now}
      onSelect={(t) => { setRecord({ kind: "task", id: t.id }); if (compact) setTab("records"); else setSide("records"); }} />
  );
  const catalogue = base && (
    <Catalogue rows={rows} total={targets.length} hover={hover} selected={selected} query={query} cls={cls} errors={search.errors} input={searchInput}
      onHover={setHover} onSelect={(id) => { select(id); if (compact) setTab("light"); }} onQuery={setQuery} onClass={setCls}
      segments={{ value: segment, onChange: setSegment, counts: { targets: targets.length, candidates: recordLists.candidates?.length ?? null, tasks: recordLists.tasks?.length ?? null },
        body: recordLists.error && !recordLists.candidates ? <div className="error-inline">The records did not load. {recordLists.error}</div>
          : segment === "candidates" ? candidateTable(false, recordLists.candidates) : taskTable }} />
  );
  // The shown run has no job for the selected observation: show the runs that hold it, not the previous target's plots.
  const noJob = evError != null && /no job/.test(evError);
  const benchEvidence = noJob ? null : evidence;
  const status = benchEvidence && !fresh && current && (
    <div className="bench-status">
      {evError ? <span className="bad">{current.name ?? current.tic}: {evError}</span> : <>Loading <b>{current.name ?? current.tic}</b></>}
      {" · showing "}{shownTarget?.name ?? shownTarget?.tic}
    </div>
  );
  const focusNote = focusRunId && fresh && (
    <div className="bench-focus">candidate evidence · run <b>{focusRunId.slice(0, 8)}</b> · not the shown run <button onClick={() => showRun(focusRunId)}>Show this run</button></div>
  );
  const inspector = current
    ? <Inspector target={current} observation={observation?.id === current.id ? observation : null} ev={fresh} method={method} run={focusRunId ? (runs ?? []).find((r) => r.id === focusRunId) ?? null : activeRun} loading={!fresh && !evError} error={evError} changeMs={changeMs}
      onNewCandidate={fresh ? () => { setRecord({ kind: "new-candidate" }); if (compact) setTab("records"); else setSide("records"); } : undefined} />
    : <div className="empty">No target selected.</div>;
  const recordsPanel = base && (
    <RecordsPanel selection={record} campaigns={campaigns} tasks={recordLists.tasks} targetsById={targetsById} methods={base.methods} current={current} evidence={fresh} now={now}
      onSelect={(s) => setRecord(s)} onDetail={onCandidateDetail} onExport={(x) => setExporting(x)} onChanged={recordLists.refresh} />
  );
  const comparePanel = (compactTable: boolean) => (
    <ComparePanel runs={analysisRuns} a={cmpA} b={cmpB} data={comparison.data} error={comparison.error} targetsById={targetsById} selected={selected} compact={compactTable}
      onPick={(side, id) => (side === "a" ? setCmpA(id) : setCmpB(id))} onSelect={(id) => select(id)} />
  );
  const compareSide = (
    <CompareSide a={cmpA} b={cmpB} evA={evA?.observation.id === selected ? evA : null} evB={evB?.observation.id === selected ? evB : null} target={current}
      onSwap={() => { setCmpA(cmpB); setCmpB(cmpA); }} onShowA={() => { if (cmpA) { showRun(cmpA); setWorkspace("sky"); } }}
      onExport={(id) => setExporting({ kind: "run", id, label: id.slice(0, 8) })} />
  );
  const exportDialog = exporting && <ExportDialog subject={exporting} onClose={() => setExporting(null)} />;
  const whoButton = <button className="seg toggle who" onClick={() => session.set(null)} title="Sign out of this browser">{me ? me.name : "…"} · sign out</button>;
  const motionButton = <button className="seg toggle" onClick={() => motion.set(mode === "animated" ? "reduced" : "animated")} title="Reduced motion removes camera animation">motion <b>{mode}</b></button>;
  const filtered = useMemo(() => filterCandidates(recordLists.candidates ?? [], candFilter, (c) => candidateTarget(c, targetsById)), [recordLists.candidates, candFilter, targetsById]);
  const writers = useMemo(() => [...new Set((recordLists.candidates ?? []).map((c) => c.actor.name))].sort(), [recordLists.candidates]);

  if (compact) {
    const plotTab = tab === "light" || tab === "pgram" || tab === "fold";
    return (
      <div className="app compact">
        <div className="bar">
          <span className="brand">DELTA OBSERVATORY</span>
          <span className="seg">api <b className={base ? "ok" : error ? "bad" : ""}>{base ? base.health.status : error ? "error" : "…"}</b></span>
          {whoButton}
          {motionButton}
        </div>
        <div className="sky-cell" ref={skyCell}>
          {sky}
          <AllSky targets={targets} stars={stars} selected={selected} matches={matches} sky={skyCell} flagged={flagged} />
          {error && <div className="error">API error. {error}</div>}
        </div>
        <div className="rule" onPointerDown={onRule} />
        <div className="selbar">
          <button onClick={() => step(-1)} aria-label="Previous target">‹</button>
          {current
            ? <span className="id" onClick={() => current.v && camera.flyTo(current.v, motion.get() === "animated")}><b>{current.name ?? current.tic}</b> {current.tic} · S{String(current.sector).padStart(2, "0")}</span>
            : <span className="none">No target selected · {rows.length} shown</span>}
          <button onClick={() => step(1)} aria-label="Next target">›</button>
        </div>
        <nav className="mtabs">
          {TABS.map(([k, label]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>)}
        </nav>
        <div className="pane">
          <div className={tab === "targets" ? "pane-fill" : "hidden"}>{catalogue}</div>
          <div className={plotTab ? `pane-fill bench-one${benchEvidence && !fresh ? " stale" : ""}` : "hidden"}>
            {benchEvidence ? (
              <>
                <div className={tab === "light" ? "pane-fill" : "hidden"}><LightCurve ev={benchEvidence} brush={brush} cursorT={cursorT} foldP={foldP} onBrush={setBrush} onCursorT={setCursorT} /></div>
                <div className={tab === "pgram" ? "pane-fill" : "hidden"}><Periodogram ev={benchEvidence} foldP={foldP} cursorP={cursorP} onFoldP={setFoldP} onCursorP={setCursorP} /></div>
                <div className={tab === "fold" ? "pane-fill" : "hidden"}><Fold ev={benchEvidence} brush={brush} cursorT={cursorT} foldP={foldP} /></div>
                {status}
                {(brush || foldP) && (
                  <div className="chips">
                    {brush && <button onClick={() => setBrush(null)}>Clear time range</button>}
                    {foldP && <button onClick={() => setFoldP(null)}>Stored fold</button>}
                  </div>
                )}
              </>
            ) : evError ? <RunsHolding message={evError} observationId={selected} onShow={showRun} /> : <div className="empty">{current ? "Loading the result artifacts…" : "Select a target in Targets or on the sky."}</div>}
          </div>
          <div className={tab === "details" ? "pane-fill details" : "hidden"}>{inspector}</div>
          <div className={tab === "run" ? "pane-fill details" : "hidden"}>{runPanel}</div>
          <div className={tab === "records" ? "pane-fill details" : "hidden"}>{recordsPanel}</div>
          <div className={tab === "compare" ? "pane-fill details" : "hidden"}>{comparePanel(true)}</div>
        </div>
        {exportDialog}
      </div>
    );
  }

  const sel = <F extends keyof CandidateFilter>(key: F, label: string, options: [string, string][]) => (
    <label className="fsel"><span>{label}</span><select value={candFilter[key]} onChange={(e) => setCandFilter({ ...candFilter, [key]: e.target.value })}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  );
  const evidenceLayer = (
    <section className="ws-layer">
      <div className="filter ws-filter">
        <input value={candFilter.text} onChange={(e) => setCandFilter({ ...candFilter, text: e.target.value })} placeholder="label, summary, target" spellCheck={false} />
        {sel("campaign", "campaign", [["all", "all"], ["none", "none"], ...[...campaigns.values()].map((c) => [c.id, c.name] as [string, string])])}
        {sel("tier", "tier", [["all", "all"], ["platform", "platform"], ["lab", "lab"]])}
        {sel("kind", "kind", [["all", "all"], ["transit_signal", "transit"], ["moving_object", "moving"]])}
        {sel("evidence", "evidence", [["all", "all"], ...["unreviewed", "supported", "ambiguous", "rejected"].map((x) => [x, x] as [string, string])])}
        {sel("identity", "identity", [["all", "all"], ...["unchecked", "matched", "unmatched", "ambiguous"].map((x) => [x, x] as [string, string])])}
        {sel("writer", "writer", [["all", "all"], ...writers.map((w) => [w, w] as [string, string])])}
        <span className="small">{filtered.length} of {recordLists.candidates?.length ?? "…"} candidates · status rule candidate-status/1</span>
      </div>
      <div className="scroll">{candidateTable(true, recordLists.candidates ? filtered : null)}</div>
    </section>
  );
  const foldOf = (ev: Evidence | null, err: string | null, side: "A" | "B", id: string | null) => (
    <div className="cmp-fold">
      <span className="cmp-fold-label"><b>{side}</b> run {id?.slice(0, 8) ?? "—"}</span>
      {ev && ev.observation.id === selected ? <Fold ev={ev} brush={null} cursorT={null} foldP={null} /> : <div className="empty">{!selected ? "Select a row." : err ? (/no job/.test(err) ? `Run ${side} has no job for this observation.` : err) : id ? "Loading…" : "Choose a run."}</div>}
    </div>
  );
  const sideTabs: [Side, string][] = workspace === "analysis" ? [["details", "Details"], ["run", "Run"], ["compare", "Compare"]] : [["details", "Details"], ["run", "Run"], ["records", "Records"]];
  const shownSide: Side = workspace === "analysis" ? (side === "records" ? "compare" : side) : side === "compare" ? "records" : side;
  const sidePanel = shownSide === "details" ? inspector : shownSide === "run" ? runPanel : shownSide === "records" ? recordsPanel : compareSide;

  return (
    <div className="app">
      <div className="bar">
        <span className="brand">DELTA OBSERVATORY</span>
        <span className="seg">dataset <b>{base?.dataset?.id ?? "—"}</b> · <b>{base?.dataset?.observation_counts.ready ?? "—"}</b> ready</span>
        {workspace === "analysis"
          ? <span className="seg">compare <b>A {cmpA?.slice(0, 8) ?? "—"}</b> · <b>B {cmpB?.slice(0, 8) ?? "—"}</b></span>
          : <button className="seg run-seg" onClick={() => setSide("run")} title="Open the run panel">run <b>{run ? run.label || run.id.slice(0, 8) : "—"}</b> · {run ? `${run.method_id} v${run.method_version}` : "no analysis run"} · <b>{run ? `${run.job_states.complete ?? 0}/${run.input_count}` : "—"}</b> complete</button>}
        <span className="seg">api <b className={base ? "ok" : error ? "bad" : ""}>{base ? base.health.status : error ? "error" : "…"}</b></span>
        <span className="seg perf">catalogue {base && targetsLoadMs != null ? `${(base.loadMs + targetsLoadMs).toFixed(0)} ms` : "…"} · first sky {firstSky != null ? `${firstSky.toFixed(0)} ms` : "…"}</span>
        {whoButton}
          {motionButton}
        <span className="tabs">
          <button className={workspace === "sky" ? "on" : ""} onClick={() => setWorkspace("sky")}>SKY</button>
          <button disabled title="The DATASETS workspace is not implemented.">DATASETS</button>
          <button className={workspace === "analysis" ? "on" : ""} onClick={() => { setWorkspace("analysis"); setSide("compare"); }}>ANALYSIS</button>
          <button className={workspace === "evidence" ? "on" : ""} onClick={() => { setWorkspace("evidence"); setSide("records"); }}>EVIDENCE</button>
        </span>
      </div>
      <div className="sky-cell" ref={skyCell}>
        {sky}
        {catalogue}
        <AllSky targets={targets} stars={stars} selected={selected} matches={matches} sky={skyCell} flagged={flagged} />
        <div className="hud keys"><b>drag</b> turn · <b>wheel</b> zoom · <b>click</b> select · <b>/</b> search · <b>j</b> <b>k</b> next, previous · <b>f</b> turn to selection · <b>+</b> <b>−</b> zoom</div>
        {error && <div className="error">API error. {error}</div>}
        {workspace === "analysis" && <section className="ws-layer">{comparePanel(false)}</section>}
        {workspace === "evidence" && evidenceLayer}
      </div>
      <div className="rule" onPointerDown={onRule} title="Drag to resize" />
      {workspace === "analysis" ? (
        <div className="bench cmp-bench">
          {foldOf(evA, cmpErr[0], "A", cmpA)}
          {foldOf(evB, cmpErr[1], "B", cmpB)}
        </div>
      ) : (
        <div className={`bench${benchEvidence && !fresh ? " stale" : ""}`}>
          {benchEvidence ? (
            <>
              <LightCurve ev={benchEvidence} brush={brush} cursorT={cursorT} foldP={foldP} onBrush={setBrush} onCursorT={setCursorT} />
              <div className="bench-row">
                <Periodogram ev={benchEvidence} foldP={foldP} cursorP={cursorP} onFoldP={setFoldP} onCursorP={setCursorP} />
                <Fold ev={benchEvidence} brush={brush} cursorT={cursorT} foldP={foldP} />
              </div>
              {status}
              {focusNote}
            </>
          ) : evError ? <RunsHolding message={evError} observationId={selected} onShow={showRun} /> : <div className="empty">{current ? "Loading the result artifacts…" : "No target selected."}</div>}
        </div>
      )}
      <section className="panel inspector">
        <header>
          <span className="side-tabs">
            {sideTabs.map(([k, l]) => <button key={k} className={shownSide === k ? "on" : ""} onClick={() => setSide(k)}>{l}</button>)}
          </span>
          {current && <span className="id"><b>{current.name ?? current.tic}</b> · S{String(current.sector).padStart(2, "0")}</span>}
        </header>
        {sidePanel}
      </section>
      {exportDialog}
    </div>
  );
}
