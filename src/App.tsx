import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Catalogue } from "./Catalogue";
import { loadCatalogue, type Catalogue as CatalogueData } from "./data/catalogue";
import { loadEvidence, prefetchEvidence, type Evidence } from "./data/evidence";
import { Inspector } from "./Inspector";
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

export function App() {
  const [data, setData] = useState<CatalogueData | null>(null);
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

  useEffect(() => {
    loadCatalogue().then(setData, (e: Error) => setError(e.message));
    getStatic<StarColumns>("/sky/stars.json").then(setStars, (e: Error) => setError(e.message));
    getStatic<{ lines: { points: number[] }[] }>("/sky/constellations.json").then((c) => setLines(c.lines.map((l) => l.points)), (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (firstSky != null) return;
    const id = setInterval(() => { if (marks.firstSky != null) { setFirstSky(marks.firstSky); clearInterval(id); } }, 100);
    return () => clearInterval(id);
  }, [firstSky]);

  const targets = useMemo(() => data?.targets ?? [], [data]);
  const search = useMemo(() => parseSearch(query, cls), [query, cls]);
  const rows = useMemo(() => targets.filter(search.test).sort((a, b) => (b.snr ?? -1) - (a.snr ?? -1)), [targets, search]);
  const matches = useMemo(() => new Set(rows.map((t) => t.id)), [rows]);
  const current = targets.find((t) => t.id === selected) ?? null;

  const select = (id: string) => {
    const t = targets.find((x) => x.id === id);
    if (id !== selected) { changeStart.current = performance.now(); setBrush(null); setFoldP(null); setCursorT(null); }
    setSelected(id);
    if (t?.v) camera.flyTo(t.v, motion.get() === "animated");
  };

  // Loads the result artifacts of the selected target. A newer selection replaces an older load.
  useEffect(() => {
    if (!selected || !data) { setEvidence(null); return; }
    let live = true;
    setEvError(null);
    loadEvidence(selected, data).then((ev) => { if (live) setEvidence(ev); }, (e: Error) => { if (live) setEvError(e.message); });
    return () => { live = false; };
  }, [selected, data]);

  // Time from a target change to the first frame with its plots.
  useEffect(() => {
    if (!evidence || changeStart.current == null) return;
    const t0 = changeStart.current;
    requestAnimationFrame(() => requestAnimationFrame(() => { setChangeMs(performance.now() - t0); changeStart.current = null; }));
  }, [evidence]);
  // During a load, the plots keep the previous result, dim and labelled, so that the workbench does not go blank.
  const fresh = evidence && evidence.observation.id === selected ? evidence : null;
  const shownTarget = evidence ? targets.find((t) => t.id === evidence.observation.id) ?? null : null;

  // Loads in advance: the next and previous rows after each selection.
  useEffect(() => {
    if (!data || !fresh) return;
    const i = rows.findIndex((t) => t.id === fresh.observation.id);
    for (const t of [rows[i + 1], rows[i - 1]]) if (t) prefetchEvidence(t.id, data);
  }, [data, fresh, rows]);

  // Loads in advance when the pointer rests on a marker or a row for 120 ms.
  useEffect(() => {
    if (!data || !hover) return;
    const id = setTimeout(() => prefetchEvidence(hover, data), 120);
    return () => clearTimeout(id);
  }, [data, hover]);

  // Keys: / search, j and k next and previous, f turn to the selection, + and − zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) { setBrush(null); setFoldP(null); return; }
      if (e.target instanceof HTMLInputElement) {
        if (e.key === "Escape" || e.key === "Enter") e.target.blur();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = rows.findIndex((t) => t.id === selected);
      if (e.key === "/") { e.preventDefault(); searchInput.current?.focus(); }
      else if (e.key === "j" && rows.length) select((rows[i + 1] ?? rows[0])!.id);
      else if (e.key === "k" && rows.length) select((i > 0 ? rows[i - 1] : rows[rows.length - 1])!.id);
      else if (e.key === "f" && current?.v) camera.flyTo(current.v, motion.get() === "animated");
      else if (e.key === "+" || e.key === "=") camera.zoomBy(1 / 1.25);
      else if (e.key === "-") camera.zoomBy(1.25);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const onRule = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => document.documentElement.style.setProperty("--sky-h", `${Math.min(Math.max(ev.clientY - 31, 160), innerHeight - 220)}px`);
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const run = data?.run;
  return (
    <div className="app">
      <div className="bar">
        <span className="brand">DELTA OBSERVATORY</span>
        <span className="seg">dataset <b>{data?.dataset?.id ?? "—"}</b> · <b>{data?.dataset?.observation_counts.ready ?? "—"}</b> ready</span>
        <span className="seg">run <b>{run ? run.id.slice(0, 8) : "—"}</b> · {run ? `${run.method_id} v${run.method_version}` : "no tess-bls run"} · <b>{run ? `${run.job_states.complete ?? 0}/${run.input_count}` : "—"}</b> complete</span>
        <span className="seg">api <b className={data ? "ok" : error ? "bad" : ""}>{data ? data.health.status : error ? "error" : "…"}</b></span>
        <span className="seg perf">catalogue {data ? `${data.loadMs.toFixed(0)} ms` : "…"} · first sky {firstSky != null ? `${firstSky.toFixed(0)} ms` : "…"}</span>
        <button className="seg toggle" onClick={() => motion.set(mode === "animated" ? "reduced" : "animated")} title="Reduced motion removes camera animation">motion <b>{mode}</b></button>
        <span className="tabs"><span className="on">SKY</span><span>DATASETS</span><span>ANALYSIS</span><span>EVIDENCE</span></span>
      </div>
      <div className="sky-cell" ref={skyCell}>
        {WEBGL.ok ? (
          <SkyBoundary>
            <SkyView targets={targets} stars={stars} lines={lines} hover={hover} selected={selected} matches={matches} onHover={setHover} onSelect={select} />
          </SkyBoundary>
        ) : <SkyUnavailable reason={WEBGL.reason} />}
        {data && (
          <Catalogue rows={rows} total={targets.length} hover={hover} selected={selected} query={query} cls={cls} errors={search.errors} input={searchInput}
            onHover={setHover} onSelect={select} onQuery={setQuery} onClass={setCls} />
        )}
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
            {!fresh && current && (
              <div className="bench-status">
                {evError ? <span className="bad">{current.name ?? current.tic}: {evError}</span> : <>Loading <b>{current.name ?? current.tic}</b></>}
                {" · showing "}{shownTarget?.name ?? shownTarget?.tic}
              </div>
            )}
          </>
        ) : <div className="empty">{evError ?? (current ? "Loading the result artifacts…" : "No target selected.")}</div>}
      </div>
      <section className="panel inspector">
        <header>{current ? <span className="id"><b>{current.name ?? current.tic}</b> · {current.tic} · S{String(current.sector).padStart(2, "0")}</span> : <span>Inspector</span>}</header>
        {current ? <Inspector target={current} observation={data?.observations.get(current.id) ?? null} ev={fresh} method={data?.method ?? null} run={data?.run ?? null} loading={!fresh && !evError} error={evError} changeMs={changeMs} /> : <div className="empty">No target selected.</div>}
      </section>
    </div>
  );
}
