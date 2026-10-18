import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
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
      // Fainter stars appear as the view zooms in: magnitude 6 at 110 degrees, magnitude 8 at 40 degrees.
      skyUniforms.uMagLimit.value = 6 + 2 * clamp((110 - fov) / 70, 0, 1);
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

interface Props {
  targets: Target[];
  stars: StarColumns | null;
  lines: number[][] | null;
  hover: string | null;
  selected: string | null;
  matches: Set<string>;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** Observations that candidate records refer to. A dashed square marks them. */
  flagged?: Set<string>;
}

const CLASS = { planet_host: "planet host", no_known_planet: "no known planet", eclipsing_binary: "eclipsing binary" };

export function SkyView({ targets, stars, lines, hover, selected, matches, onHover, onSelect, flagged }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; x0: number; y0: number } | null>(null);
  const [tip, setTip] = useState<{ t: Target; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const wheel = (e: WheelEvent) => { e.preventDefault(); camera.cancel(); camera.zoomBy(Math.exp(e.deltaY * 0.0012)); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  // Active pointers, for a two-finger pinch zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const hitTest = (x: number, y: number, radius = 10) => {
    const r = wrap.current!.getBoundingClientRect(), { basis, fov } = camera.get(), k = projectionScale(r.width, fov);
    let best: { t: Target; x: number; y: number } | null = null, bd = radius;
    for (const t of targets) {
      if (!t.v) continue;
      const p = project(t.v, basis, k);
      if (p.theta > 2.6) continue;
      const px = r.width / 2 + p.x, py = r.height / 2 + p.y, d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = { t, x: px, y: py }; }
    }
    return best;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    camera.cancel();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      drag.current = null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
  };
  // A release within 3 px of the press is a click. A click on a marker selects its target.
  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) >= (e.pointerType === "touch" ? 8 : 3)) return;
    const r = wrap.current!.getBoundingClientRect(), hit = hitTest(e.clientX - r.left, e.clientY - r.top, e.pointerType === "touch" ? 22 : 10);
    if (hit) onSelect(hit.t.id);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current != null && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()], dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (dist > 0) camera.zoomBy(pinch.current / dist);
      pinch.current = dist;
      return;
    }
    if (drag.current) {
      camera.dragBy(e.clientX - drag.current.x, e.clientY - drag.current.y, r.width);
      drag.current = { ...drag.current, x: e.clientX, y: e.clientY };
      setTip(null);
      return;
    }
    if (e.pointerType === "touch") return;
    const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
    setTip(hit);
    onHover(hit ? hit.t.id : null);
  };
  const onPointerLeave = () => { setTip(null); onHover(null); };
  const onPointerCancel = (e: ReactPointerEvent) => { pointers.current.delete(e.pointerId); pinch.current = null; drag.current = null; };

  return (
    <div className="sky" ref={wrap} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerLeave} onPointerCancel={onPointerCancel} style={{ cursor: tip ? "pointer" : "grab" }}>
      <Canvas frameloop="demand" dpr={[1, 2]} flat linear gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => gl.setClearColor(colors.bg)}>
        <SkySync />
        <MilkyWay />
        <Grid />
        {lines && <Constellations lines={lines} />}
        {stars && <Stars stars={stars} />}
        <Targets targets={targets} hover={hover} selected={selected} matches={matches} />
        <FrameProbe ready={targets.length > 0 && stars != null} />
      </Canvas>
      <SkyHud />
      {flagged && flagged.size > 0 && <CandidateMarks targets={targets} flagged={flagged} wrap={wrap} />}
      <SelectionMark target={targets.find((t) => t.id === selected) ?? null} wrap={wrap} />
      {tip && (
        <div className="tip" style={{ left: tip.x + 14, top: tip.y + 10 }}>
          <b>{tip.t.name ?? "—"}</b> {tip.t.tic}
          <br />{tip.t.cls ? CLASS[tip.t.cls] : "class withheld"} · S{String(tip.t.sector).padStart(2, "0")} · Tmag {tip.t.tmag?.toFixed(2) ?? "—"}
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
      <span className="hud-extra">FRAME equatorial ICRS · no site · north up<br /></span>
      VIEW RA {ra.toFixed(2)}° Dec {dec.toFixed(2)}° · FOV {fov.toFixed(0)}°
      <span className="hud-extra"><br /><span style={{ color: "rgba(240,166,64,.85)" }}>– – ecliptic</span>  <span style={{ color: "rgba(197,140,255,.85)" }}>– – galactic plane</span>  Milky Way: drawn model
      <br />frame p95 {ms(stats.intervalP95)} ms · render CPU p95 {ms(stats.renderP95)} ms</span>
    </div>
  );
}

function useSize(wrap: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrap]);
  return size;
}

/** A dashed square at each target that has candidate records. It does not encode a status. */
function CandidateMarks({ targets, flagged, wrap }: { targets: Target[]; flagged: Set<string>; wrap: RefObject<HTMLDivElement | null> }) {
  const { basis, fov } = useCamera();
  const size = useSize(wrap);
  if (size.w === 0) return null;
  const k = projectionScale(size.w, fov), boxes: [number, number, string][] = [];
  for (const t of targets) {
    if (!t.v || !flagged.has(t.id)) continue;
    const p = project(t.v, basis, k), x = size.w / 2 + p.x, y = size.h / 2 + p.y;
    if (p.theta > 2.6 || x < -12 || y < -12 || x > size.w + 12 || y > size.h + 12) continue;
    boxes.push([x, y, t.id]);
  }
  return (
    <svg className="cand-marks" width={size.w} height={size.h} aria-hidden="true">
      {boxes.map(([x, y, id]) => <rect key={id} x={x - 10} y={y - 10} width={20} height={20} />)}
    </svg>
  );
}

/** Crosshair and label at the selected target. The label follows the camera. */
function SelectionMark({ target, wrap }: { target: Target | null; wrap: RefObject<HTMLDivElement | null> }) {
  const { basis, fov } = useCamera();
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrap]);
  if (!target?.v || size.w === 0) return null;
  const p = project(target.v, basis, projectionScale(size.w, fov));
  const x = size.w / 2 + p.x, y = size.h / 2 + p.y;
  if (p.theta > 2.6 || x < -40 || y < -40 || x > size.w + 40 || y > size.h + 40) return null;
  return (
    <div className="sel-mark" style={{ left: x, top: y }}>
      <svg width="200" height="70" viewBox="-30 -50 200 70" style={{ left: -30, top: -50 }}>
        <path d="M-22 0H-10M10 0H22M0 -22V-10M0 10V22M13 -13L36 -36H186" />
      </svg>
      <div className="sel-label">
        <b>{target.name ?? target.tic.replace(":", " ")}</b>
        <span>{target.tic}  S{String(target.sector).padStart(2, "0")}</span>
        <span>RA {target.ra?.toFixed(4)}°  Dec {target.dec?.toFixed(4)}°</span>
      </div>
    </div>
  );
}
