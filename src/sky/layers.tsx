import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { displayStatus, type Target } from "../data/catalogue";
import { colors, sky } from "../theme";
import { ecliptic, eqToVec, galacticEquator, GALACTIC, RAD, type Vec3 } from "./math";
import { lineFragment, lineVertex, milkyWayFragment, milkyWayVertex, starFragment, starVertex, targetFragment, targetVertex } from "./shaders";
import { skyUniforms } from "./uniforms";

const rgba = (c: readonly number[]) => new THREE.Vector4(c[0]! / 255, c[1]! / 255, c[2]! / 255, c[3] ?? 1);

/** Great-circle interpolation, so that long segments follow the sphere. */
function densify(points: Vec3[], maxStepDeg = 1): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const ang = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    const n = Math.max(1, Math.ceil(ang / (maxStepDeg * RAD)));
    for (let j = 0; j < n; j++) {
      const t = j / n, s = Math.sin(ang) || 1;
      const wa = ang < 1e-9 ? 1 - t : Math.sin((1 - t) * ang) / s, wb = ang < 1e-9 ? t : Math.sin(t * ang) / s;
      out.push([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Line segments from polylines. aAlong is the cumulative angle in degrees, for dashes. */
function segments(polylines: Vec3[][]): THREE.BufferGeometry {
  const pos: number[] = [], along: number[] = [];
  for (const line of polylines) {
    const pts = densify(line);
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const step = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / RAD;
      pos.push(...a, ...b); along.push(acc, acc + step); acc += step;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  return g;
}

function lineMaterial(color: readonly number[], dashDeg = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: lineVertex, fragmentShader: lineFragment, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { ...skyUniforms, uColor: { value: rgba(color) }, uDash: { value: dashDeg } },
  });
}

function useDispose(...items: { dispose(): void }[]) {
  useEffect(() => () => items.forEach((i) => i.dispose()), items);
}

export function Grid() {
  const { minor, equator, ecl, gal } = useMemo(() => {
    const decs = [-60, -30, 30, 60].map((d) => Array.from({ length: 181 }, (_, i) => eqToVec(i * 2, d)));
    const ras = Array.from({ length: 12 }, (_, k) => Array.from({ length: 89 }, (_, i) => eqToVec(k * 30, -88 + i * 2)));
    return {
      minor: { g: segments([...decs, ...ras]), m: lineMaterial(sky.grid) },
      equator: { g: segments([Array.from({ length: 181 }, (_, i) => eqToVec(i * 2, 0))]), m: lineMaterial(sky.gridEquator) },
      ecl: { g: segments([ecliptic(2)]), m: lineMaterial(sky.ecliptic, 3) },
      gal: { g: segments([galacticEquator(2)]), m: lineMaterial(sky.galactic, 3) },
    };
  }, []);
  useDispose(minor.g, minor.m, equator.g, equator.m, ecl.g, ecl.m, gal.g, gal.m);
  return (
    <>
      {[minor, equator, ecl, gal].map((x, i) => <lineSegments key={i} geometry={x.g} material={x.m} frustumCulled={false} renderOrder={1} />)}
    </>
  );
}

export function Constellations({ lines }: { lines: number[][] }) {
  const { g, m } = useMemo(() => {
    const polylines = lines.map((pts) => { const out: Vec3[] = []; for (let i = 0; i < pts.length; i += 2) out.push(eqToVec(pts[i]!, pts[i + 1]!)); return out; });
    return { g: segments(polylines), m: lineMaterial(sky.constellation) };
  }, [lines]);
  useDispose(g, m);
  return <lineSegments geometry={g} material={m} frustumCulled={false} renderOrder={2} />;
}

function bvColor(bv: number | null): [number, number, number] {
  const t = Math.min(1, Math.max(0, ((bv ?? 0.6) + 0.3) / 2));
  const c0 = [170, 196, 255], c1 = [255, 244, 232], c2 = [255, 196, 140];
  const [a, b, s] = t < 0.4 ? [c0, c1, t / 0.4] : [c1, c2, (t - 0.4) / 0.6];
  return [0, 1, 2].map((i) => (a[i]! + (b[i]! - a[i]!) * s) / 255) as [number, number, number];
}

export interface StarColumns { ra: number[]; dec: number[]; mag: number[]; bv: (number | null)[] }

export function Stars({ stars }: { stars: StarColumns }) {
  const { g, m } = useMemo(() => {
    const n = stars.ra.length, pos = new Float32Array(n * 3), magA = new Float32Array(n), size = new Float32Array(n), glow = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set(eqToVec(stars.ra[i]!, stars.dec[i]!), i * 3);
      const mag = stars.mag[i]!;
      magA[i] = mag;
      size[i] = Math.max(1.6, (6.8 - mag) * 1.3);
      glow[i] = mag < 2.2 ? 1 : 0;
      col.set(bvColor(stars.bv[i] ?? null), i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aMag", new THREE.BufferAttribute(magA, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({ vertexShader: starVertex, fragmentShader: starFragment, uniforms: skyUniforms, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    return { g, m };
  }, [stars]);
  useDispose(g, m);
  return <points geometry={g} material={m} frustumCulled={false} renderOrder={3} />;
}

const STATUS_COLOR = { match: colors.stMatch, near: colors.stNear, miss: colors.stMiss, signal: colors.stSignal, eb: colors.stEb, quiet: colors.stQuiet };
const SHAPE = { planet_host: 0, no_known_planet: 1, eclipsing_binary: 2 } as const;

/** Target markers. State 0 is normal, 1 is dim (filtered out), 2 is hovered. */
export function Targets({ targets, hover }: { targets: Target[]; hover: string | null }) {
  const placed = useMemo(() => targets.filter((t) => t.v), [targets]);
  const { g, m } = useMemo(() => {
    const n = placed.length, pos = new Float32Array(n * 3), shape = new Float32Array(n), col = new Float32Array(n * 3);
    placed.forEach((t, i) => {
      pos.set(t.v!, i * 3);
      shape[i] = SHAPE[t.cls];
      const c = new THREE.Color(STATUS_COLOR[displayStatus(t)]);
      col.set([c.r, c.g, c.b], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aShape", new THREE.BufferAttribute(shape, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aState", new THREE.BufferAttribute(new Float32Array(n), 1));
    const m = new THREE.ShaderMaterial({ vertexShader: targetVertex, fragmentShader: targetFragment, uniforms: skyUniforms, transparent: true, depthTest: false, depthWrite: false });
    return { g, m };
  }, [placed]);
  useEffect(() => {
    const a = g.getAttribute("aState") as THREE.BufferAttribute;
    placed.forEach((t, i) => a.setX(i, t.id === hover ? 2 : 0));
    a.needsUpdate = true;
  }, [g, placed, hover]);
  useDispose(g, m);
  return <points geometry={g} material={m} frustumCulled={false} renderOrder={4} />;
}

export function MilkyWay() {
  const { g, m } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const gal = new THREE.Matrix3().set(...(GALACTIC.flat() as [number, number, number, number, number, number, number, number, number]));
    const c = sky.milkyWay;
    const m = new THREE.ShaderMaterial({
      vertexShader: milkyWayVertex, fragmentShader: milkyWayFragment, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { ...skyUniforms, uGal: { value: gal }, uColor: { value: new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255) }, uAlpha: { value: sky.milkyWayAlpha } },
    });
    return { g, m };
  }, []);
  useDispose(g, m);
  return <mesh geometry={g} material={m} frustumCulled={false} renderOrder={0} />;
}
