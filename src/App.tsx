import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Catalogue } from "./Catalogue";
import { loadCatalogue, type Catalogue as CatalogueData, type Target } from "./data/catalogue";
import { parseSearch, type ClassFilter } from "./data/search";
import { motion, useMotion } from "./motion";
import { marks } from "./perf/frames";
import { AllSky } from "./sky/AllSky";
import { camera } from "./sky/camera";
import type { StarColumns } from "./sky/layers";
import { SkyView } from "./sky/SkyView";

async function getStatic<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: GET ${path}`);
  return (await res.json()) as T;
}

const CLASS = { planet_host: "planet host", no_known_planet: "no known planet", eclipsing_binary: "eclipsing binary" };

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
    setSelected(id);
    if (t?.v) camera.flyTo(t.v, motion.get() === "animated");
  };

  // Keys: / search, j and k next and previous, f turn to the selection, + and − zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        <SkyView targets={targets} stars={stars} lines={lines} hover={hover} selected={selected} matches={matches} onHover={setHover} onSelect={select} />
        {data && (
          <Catalogue rows={rows} total={targets.length} hover={hover} selected={selected} query={query} cls={cls} errors={search.errors} input={searchInput}
            onHover={setHover} onSelect={select} onQuery={setQuery} onClass={setCls} />
        )}
        <AllSky targets={targets} stars={stars} selected={selected} matches={matches} sky={skyCell} />
        <div className="hud keys"><b>drag</b> turn · <b>wheel</b> zoom · <b>click</b> select · <b>/</b> search · <b>j</b> <b>k</b> next, previous · <b>f</b> turn to selection · <b>+</b> <b>−</b> zoom</div>
        {error && <div className="error">API error. {error}</div>}
      </div>
      <div className="rule" onPointerDown={onRule} title="Drag to resize" />
      <div className="bench"><div className="empty">{current ? "The workbench plots are not implemented." : "No target selected."}</div></div>
      <section className="panel inspector">
        <header>{current ? <span className="id"><b>{current.name ?? current.tic}</b> · {current.tic} · S{String(current.sector).padStart(2, "0")}</span> : <span>Inspector</span>}</header>
        {current ? <Summary t={current} /> : <div className="empty">No target selected.</div>}
      </section>
    </div>
  );
}

/** Catalogue values of the selected target. */
function Summary({ t }: { t: Target }) {
  const f = (x: number | null, d: number) => (x == null ? "—" : x.toFixed(d));
  return (
    <div className="kv">
      <span>label</span><span>{CLASS[t.cls]}{t.name ? ` · ${t.name}` : ""}</span>
      <span>RA, Dec (deg)</span><span>{f(t.ra, 5)}, {f(t.dec, 5)}</span>
      <span>T mag</span><span>{f(t.tmag, 3)}</span>
      <span>P bls (d)</span><span>{f(t.period, 6)}</span>
      <span>depth S/N</span><span>{f(t.snr, 1)}</span>
      <span>P ref (d)</span><span>{f(t.refPeriod, 6)}</span>
      <span>|ΔP/P|</span><span>{t.relErr == null ? "—" : t.relErr.toExponential(2)}</span>
    </div>
  );
}
