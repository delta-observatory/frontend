// Sky geometry. Vectors are unit vectors in the equatorial (ICRS) frame:
// x toward RA 0 Dec 0, y toward RA 90 Dec 0, z toward Dec +90.

export type Vec3 = readonly [number, number, number];

export const RAD = Math.PI / 180;

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalize(a: Vec3): Vec3 {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

export function eqToVec(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * RAD, d = decDeg * RAD;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

export function vecToEq(v: Vec3): [ra: number, dec: number] {
  return [((Math.atan2(v[1], v[0]) / RAD) % 360 + 360) % 360, Math.asin(clamp(v[2], -1, 1)) / RAD];
}

/** Rotation of v about the unit axis k by an angle in radians (Rodrigues). */
export function rotate(v: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle), kv = cross(k, v), kd = dot(k, v);
  return [0, 1, 2].map((i) => v[i]! * c + kv[i]! * s + k[i]! * kd * (1 - c)) as unknown as Vec3;
}

/**
 * Camera basis for a view from the center of the sky sphere with north up.
 * f points at the view center. r points to screen right, which is west on the sky. u points to screen up.
 */
export interface Basis { f: Vec3; r: Vec3; u: Vec3 }

export function northUpBasis(f: Vec3): Basis {
  const ff = normalize(f);
  const a = vecToEq(ff)[0] * RAD;
  const r: Vec3 = [Math.sin(a), -Math.cos(a), 0];
  return { f: ff, r, u: cross(r, ff) };
}

/** Scale of the stereographic projection in pixels, so that the horizontal field of view fills the width. */
export function projectionScale(widthPx: number, fovDeg: number): number {
  return widthPx / 2 / (2 * Math.tan((fovDeg * RAD) / 4));
}

/** Stereographic projection. Returns pixels from the screen center, with y down. */
export function project(v: Vec3, b: Basis, k: number): { x: number; y: number; theta: number } {
  const a = dot(v, b.r), c = dot(v, b.u), d = dot(v, b.f);
  const theta = Math.acos(clamp(d, -1, 1)), rho = Math.hypot(a, c) || 1e-12, s = 2 * k * Math.tan(theta / 2);
  return { x: (s * a) / rho, y: (-s * c) / rho, theta };
}

/** Inverse of project. x and y are pixels from the screen center, with y down. */
export function unproject(x: number, y: number, b: Basis, k: number): Vec3 {
  const a = x / k, c = -y / k, rho = Math.hypot(a, c) || 1e-12, theta = 2 * Math.atan(rho / 2), s = Math.sin(theta);
  const la = (s * a) / rho, lc = (s * c) / rho, lf = Math.cos(theta);
  return [0, 1, 2].map((i) => la * b.r[i]! + lc * b.u[i]! + lf * b.f[i]!) as unknown as Vec3;
}

/** Rows of the equatorial (J2000) to galactic rotation matrix. */
export const GALACTIC: readonly Vec3[] = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.444829630, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];

export function toGalactic(v: Vec3): [l: number, b: number] {
  const g: Vec3 = [dot(GALACTIC[0]!, v), dot(GALACTIC[1]!, v), dot(GALACTIC[2]!, v)];
  return [((Math.atan2(g[1], g[0]) / RAD) % 360 + 360) % 360, Math.asin(clamp(g[2], -1, 1)) / RAD];
}

/** Points on the galactic equator, in equatorial vectors. */
export function galacticEquator(stepDeg = 1): Vec3[] {
  const out: Vec3[] = [];
  for (let l = 0; l <= 360; l += stepDeg) {
    const g: Vec3 = [Math.cos(l * RAD), Math.sin(l * RAD), 0];
    out.push([0, 1, 2].map((i) => GALACTIC[0]![i]! * g[0] + GALACTIC[1]![i]! * g[1] + GALACTIC[2]![i]! * g[2]) as unknown as Vec3);
  }
  return out;
}

/** Points on the ecliptic (J2000 obliquity 23.4393 degrees), in equatorial vectors. */
export function ecliptic(stepDeg = 1): Vec3[] {
  const e = 23.4393 * RAD, out: Vec3[] = [];
  for (let l = 0; l <= 360; l += stepDeg) out.push([Math.cos(l * RAD), Math.sin(l * RAD) * Math.cos(e), Math.sin(l * RAD) * Math.sin(e)]);
  return out;
}
