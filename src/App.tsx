import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Catalogue } from "./Catalogue";
import { getJson, session } from "./api/client";
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

type Tab = "targets" | "light" | "pgram" | "fold" | "details" | "run";
const TABS: [Tab, string][] = [["targets", "Targets"], ["light", "Curve"], ["pgram", "Periodogram"], ["fold", "Fold"], ["details", "Details"], ["run", "Run"]];

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
  const [side, setSide] = useState<"details" | "run">("details");
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
  const showRun = (id: string) => { setActiveRunId(id); setEvidence(null); };
  const search = useMemo(() => parseSearch(query, cls), [query, cls]);
  // The API order (depth S/N, highest first) stays. The search only removes rows.
  const rows = useMemo(() => targets.filter(search.test), [targets, search]);
  const matches = useMemo(() => new Set(rows.map((t) => t.id)), [rows]);
  const current = targets.find((t) => t.id === selected) ?? null;

  const select = (id: string) => {
    const t = targets.find((x) => x.id === id);
    if (id !== selected) { changeStart.current = performance.now(); setBrush(null); setFoldP(null); setCursorT(null); }
    setSelected(id);
    if (t?.v) camera.flyTo(t.v, motion.get() === "animated");
  };

  // The observation record of the selected target, for the inspector.
  useEffect(() => {
    if (!selected) { setObservation(null); return; }
    let live = true;
    getObservation(selected).then((o) => { if (live) setObservation(o); }, () => {});
    return () => { live = false; };
  }, [selected]);

  // Loads the result artifacts of the selected target. A newer selection replaces an older load.
  useEffect(() => {
    if (!selected || !runId) return;
    let live = true;
    setEvError(null);
    loadEvidence(selected, runId).then((ev) => { if (live) setEvidence(ev); }, (e: Error) => { if (live) setEvError(e.message); });
    return () => { live = false; };
    // The run key reloads a target whose job finishes while the run is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, runId, runKey]);

  // Time from a target change to the first frame with its plots.
  useEffect(() => {
    if (!evidence || changeStart.current == null) return;
    const t0 = changeStart.current;
    requestAnimationFrame(() => requestAnimationFrame(() => { setChangeMs(performance.now() - t0); changeStart.current = null; }));
  }, [evidence]);
  // During a load, the plots keep the previous result, dim and labelled, so that the workbench does not go blank.
  const fresh = evidence && evidence.observation.id === selected && evidence.runId === runId ? evidence : null;
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
      onShow={showRun} refreshRuns={refreshRuns} onStartedRun={expectRun} />
  ) : <div className="empty">Loading…</div>;
  const sky = WEBGL.ok ? (
    <SkyBoundary>
      <SkyView targets={targets} stars={stars} lines={lines} hover={hover} selected={selected} matches={matches} onHover={setHover} onSelect={select} />
    </SkyBoundary>
  ) : <SkyUnavailable reason={WEBGL.reason} />;
  const catalogue = base && (
    <Catalogue rows={rows} total={targets.length} hover={hover} selected={selected} query={query} cls={cls} errors={search.errors} input={searchInput}
      onHover={setHover} onSelect={(id) => { select(id); if (compact) setTab("light"); }} onQuery={setQuery} onClass={setCls} />
  );
  const status = evidence && !fresh && current && (
    <div className="bench-status">
      {evError ? <span className="bad">{current.name ?? current.tic}: {evError}</span> : <>Loading <b>{current.name ?? current.tic}</b></>}
      {" · showing "}{shownTarget?.name ?? shownTarget?.tic}
    </div>
  );
  const inspector = current
    ? <Inspector target={current} observation={observation?.id === current.id ? observation : null} ev={fresh} method={method} run={activeRun} loading={!fresh && !evError} error={evError} changeMs={changeMs} />
    : <div className="empty">No target selected.</div>;
  const whoButton = <button className="seg toggle who" onClick={() => session.set(null)} title="Sign out of this browser">{me ? me.name : "…"} · sign out</button>;
  const motionButton = <button className="seg toggle" onClick={() => motion.set(mode === "animated" ? "reduced" : "animated")} title="Reduced motion removes camera animation">motion <b>{mode}</b></button>;

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
          <AllSky targets={targets} stars={stars} selected={selected} matches={matches} sky={skyCell} />
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
          <div className={plotTab ? `pane-fill bench-one${evidence && !fresh ? " stale" : ""}` : "hidden"}>
            {evidence ? (
              <>
                <div className={tab === "light" ? "pane-fill" : "hidden"}><LightCurve ev={evidence} brush={brush} cursorT={cursorT} foldP={foldP} onBrush={setBrush} onCursorT={setCursorT} /></div>
                <div className={tab === "pgram" ? "pane-fill" : "hidden"}><Periodogram ev={evidence} foldP={foldP} cursorP={cursorP} onFoldP={setFoldP} onCursorP={setCursorP} /></div>
                <div className={tab === "fold" ? "pane-fill" : "hidden"}><Fold ev={evidence} brush={brush} cursorT={cursorT} foldP={foldP} /></div>
                {status}
                {(brush || foldP) && (
                  <div className="chips">
                    {brush && <button onClick={() => setBrush(null)}>Clear time range</button>}
                    {foldP && <button onClick={() => setFoldP(null)}>Stored fold</button>}
                  </div>
                )}
              </>
            ) : <div className="empty">{evError ?? (current ? "Loading the result artifacts…" : "Select a target in Targets or on the sky.")}</div>}
          </div>
          <div className={tab === "details" ? "pane-fill details" : "hidden"}>{inspector}</div>
          <div className={tab === "run" ? "pane-fill details" : "hidden"}>{runPanel}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="bar">
        <span className="brand">DELTA OBSERVATORY</span>
        <span className="seg">dataset <b>{base?.dataset?.id ?? "—"}</b> · <b>{base?.dataset?.observation_counts.ready ?? "—"}</b> ready</span>
        <button className="seg run-seg" onClick={() => setSide("run")} title="Open the run panel">run <b>{run ? run.label || run.id.slice(0, 8) : "—"}</b> · {run ? `${run.method_id} v${run.method_version}` : "no analysis run"} · <b>{run ? `${run.job_states.complete ?? 0}/${run.input_count}` : "—"}</b> complete</button>
        <span className="seg">api <b className={base ? "ok" : error ? "bad" : ""}>{base ? base.health.status : error ? "error" : "…"}</b></span>
        <span className="seg perf">catalogue {base && targetsLoadMs != null ? `${(base.loadMs + targetsLoadMs).toFixed(0)} ms` : "…"} · first sky {firstSky != null ? `${firstSky.toFixed(0)} ms` : "…"}</span>
        {whoButton}
          {motionButton}
        <span className="tabs"><span className="on">SKY</span><span>DATASETS</span><span>ANALYSIS</span><span>EVIDENCE</span></span>
      </div>
      <div className="sky-cell" ref={skyCell}>
        {sky}
        {catalogue}
        <AllSky targets={targets} stars={stars} selected={selected} matches={matches} sky={skyCell} />
        <div className="hud keys"><b>drag</b> turn · <b>wheel</b> zoom · <b>click</b> select · <b>/</b> search · <b>j</b> <b>k</b> next, previous · <b>f</b> turn to selection · <b>+</b> <b>−</b> zoom</div>
        {error && <div className="error">API error. {error}</div>}
      </div>
      <div className="rule" onPointerDown={onRule} title="Drag to resize" />
      <div className={`bench${evidence && !fresh ? " stale" : ""}`}>
        {evidence ? (
          <>
            <LightCurve ev={evidence} brush={brush} cursorT={cursorT} foldP={foldP} onBrush={setBrush} onCursorT={setCursorT} />
            <div className="bench-row">
              <Periodogram ev={evidence} foldP={foldP} cursorP={cursorP} onFoldP={setFoldP} onCursorP={setCursorP} />
              <Fold ev={evidence} brush={brush} cursorT={cursorT} foldP={foldP} />
            </div>
            {status}
          </>
        ) : <div className="empty">{evError ?? (current ? "Loading the result artifacts…" : "No target selected.")}</div>}
      </div>
      <section className="panel inspector">
        <header>
          <span className="side-tabs">
            <button className={side === "details" ? "on" : ""} onClick={() => setSide("details")}>Details</button>
            <button className={side === "run" ? "on" : ""} onClick={() => setSide("run")}>Run</button>
          </span>
          {current && <span className="id"><b>{current.name ?? current.tic}</b> · S{String(current.sector).padStart(2, "0")}</span>}
        </header>
        {side === "details" ? inspector : runPanel}
      </section>
    </div>
  );
}
