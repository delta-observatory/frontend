import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Target } from "../data/catalogue";
import { frameStats, marks, recordFrame } from "../perf/frames";
import { colors } from "../theme";
import { camera, useCamera } from "./camera";
import { Constellations, Grid, MilkyWay, Stars, Targets, type StarColumns } from "./layers";
import { clamp, project, projectionScale, vecToEq } from "./math";
import { skyUniforms } from "./uniforms";

/** Copies the camera state and the canvas size into the shared uniforms. */
function SkySync() {
  const size = useThree((s) => s.size), dpr = useThree((s) => s.viewport.dpr), invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const apply = () => {
      const { basis, fov } = camera.get();
      skyUniforms.uR.value.set(...basis.r);
      skyUniforms.uU.value.set(...basis.u);
      skyUniforms.uF.value.set(...basis.f);
      skyUniforms.uK.value = projectionScale(size.width, fov);
      skyUniforms.uRes.value.set(size.width, size.height);
      skyUniforms.uDpr.value = dpr;
      skyUniforms.uZoom.value = clamp(110 / fov, 0.8, 2.2);
      invalidate();
    };
    apply();
    return camera.subscribe(apply);
  }, [size.width, size.height, dpr, invalidate]);
  return null;
}

/** Renders the scene and measures the CPU time of each render. */
function FrameProbe({ ready }: { ready: boolean }) {
  useFrame(({ gl, scene, camera: cam }) => {
    const t = performance.now();
    gl.render(scene, cam);
    const end = performance.now();
    recordFrame(end, end - t);
    if (ready && marks.firstSky == null) marks.firstSky = end;
  }, 1);
  return null;
}

function Invalidate({ dep }: { dep: unknown }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [dep, invalidate]);
  return null;
}

interface Props {
  targets: Target[];
  stars: StarColumns | null;
  lines: number[][] | null;
  hover: string | null;
  onHover: (id: string | null) => void;
}

const CLASS = { planet_host: "planet host", no_known_planet: "no known planet", eclipsing_binary: "eclipsing binary" };

export function SkyView({ targets, stars, lines, hover, onHover }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [tip, setTip] = useState<{ t: Target; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const wheel = (e: WheelEvent) => { e.preventDefault(); camera.zoomBy(Math.exp(e.deltaY * 0.0012)); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const hitTest = (x: number, y: number) => {
    const r = wrap.current!.getBoundingClientRect(), { basis, fov } = camera.get(), k = projectionScale(r.width, fov);
    let best: { t: Target; x: number; y: number } | null = null, bd = 10;
    for (const t of targets) {
      if (!t.v) continue;
      const p = project(t.v, basis, k);
      if (p.theta > 2.6) continue;
      const px = r.width / 2 + p.x, py = r.height / 2 + p.y, d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = { t, x: px, y: py }; }
    }
    return best;
  };

  const onPointerDown = (e: ReactPointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; setTip(null); };
  const onPointerUp = () => { drag.current = null; };
  const onPointerMove = (e: ReactPointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    if (drag.current) {
      camera.dragBy(e.clientX - drag.current.x, e.clientY - drag.current.y, r.width);
      drag.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
    setTip(hit);
    onHover(hit ? hit.t.id : null);
  };
  const onPointerLeave = () => { setTip(null); onHover(null); };

  return (
    <div className="sky" ref={wrap} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerLeave} style={{ cursor: tip ? "pointer" : "grab" }}>
      <Canvas frameloop="demand" dpr={[1, 2]} flat linear gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => gl.setClearColor(colors.bg)}>
        <SkySync />
        <MilkyWay />
        <Grid />
        {lines && <Constellations lines={lines} />}
        {stars && <Stars stars={stars} />}
        <Targets targets={targets} hover={hover} />
        <Invalidate dep={hover} />
        <FrameProbe ready={targets.length > 0 && stars != null} />
      </Canvas>
      <SkyHud />
      {tip && (
        <div className="tip" style={{ left: tip.x + 14, top: tip.y + 10 }}>
          <b>{tip.t.name ?? "—"}</b> {tip.t.tic}
          <br />{CLASS[tip.t.cls]} · S{String(tip.t.sector).padStart(2, "0")} · Tmag {tip.t.tmag?.toFixed(2) ?? "—"}
          <br />P bls {tip.t.period?.toFixed(5) ?? "—"} d · S/N {tip.t.snr?.toFixed(1) ?? "—"}
          {tip.t.refPeriod != null && <><br />P ref {tip.t.refPeriod.toFixed(5)} d · |ΔP/P| {tip.t.relErr?.toExponential(1) ?? "—"}</>}
        </div>
      )}
    </div>
  );
}

function SkyHud() {
  const { basis, fov } = useCamera();
  const [stats, setStats] = useState(frameStats());
  useEffect(() => { const id = setInterval(() => setStats(frameStats()), 500); return () => clearInterval(id); }, []);
  const [ra, dec] = vecToEq(basis.f);
  const ms = (x: number | null) => (x == null ? "—" : x.toFixed(1));
  return (
    <div className="hud sky-hud">
      FRAME equatorial ICRS · no site · north up
      <br />VIEW RA {ra.toFixed(2)}° Dec {dec.toFixed(2)}° · FOV {fov.toFixed(0)}°
      <br /><span style={{ color: "rgba(240,166,64,.85)" }}>– – ecliptic</span>  <span style={{ color: "rgba(197,140,255,.85)" }}>– – galactic plane</span>  Milky Way: drawn model
      <br />frame p95 {ms(stats.intervalP95)} ms · render CPU p95 {ms(stats.renderP95)} ms
    </div>
  );
}
