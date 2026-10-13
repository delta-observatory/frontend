import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Catalogue } from "./Catalogue";
import { loadCatalogue, type Catalogue as CatalogueData } from "./data/catalogue";
import { marks } from "./perf/frames";
import type { StarColumns } from "./sky/layers";
import { SkyView } from "./sky/SkyView";

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
  const [firstSky, setFirstSky] = useState<number | null>(null);

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
        <span className="tabs"><span className="on">SKY</span><span>DATASETS</span><span>ANALYSIS</span><span>EVIDENCE</span></span>
      </div>
      <div className="sky-cell">
        <SkyView targets={data?.targets ?? []} stars={stars} lines={lines} hover={hover} onHover={setHover} />
        {data && <Catalogue targets={data.targets} hover={hover} onHover={setHover} />}
        {error && <div className="error">API error. {error}</div>}
      </div>
      <div className="rule" onPointerDown={onRule} title="Drag to resize" />
      <div className="bench"><div className="empty">No target selected.</div></div>
      <section className="panel inspector"><header><span>Inspector</span></header><div className="empty">No target selected.</div></section>
    </div>
  );
}
