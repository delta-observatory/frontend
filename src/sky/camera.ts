import { useSyncExternalStore } from "react";
import { clamp, cross, dot, eqToVec, normalize, northUpBasis, RAD, rotate, vecToEq, type Basis, type Vec3 } from "./math";

/** View from the center of the sky sphere. North stays up. */
export interface CameraState { basis: Basis; fov: number }

const FOV_MIN = 12, FOV_MAX = 150;
/** The address hash can set the first view, for example #ra=266.4&dec=-28.9&fov=100. */
function initialState(): CameraState {
  const h = new URLSearchParams(globalThis.location?.hash.slice(1) ?? "");
  const n = (k: string, d: number) => { const x = Number(h.get(k)); return h.has(k) && Number.isFinite(x) ? x : d; };
  return { basis: northUpBasis(eqToVec(n("ra", 32), clamp(n("dec", -38), -89.5, 89.5))), fov: clamp(n("fov", 110), FOV_MIN, FOV_MAX) };
}

let state: CameraState = initialState();
const listeners = new Set<() => void>();

let animation: number | null = null;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Duration of a camera turn in ms: 0.3 s to 0.9 s, longer for larger angles. */
export function flyDuration(angleRad: number): number {
  return clamp(280 + (angleRad / RAD) * 4, 280, 900);
}

function set(next: Partial<CameraState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export const camera = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Turns the view center to a direction along a great circle. With animate false, the turn is immediate. */
  flyTo(target: Vec3, animate: boolean) {
    camera.cancel();
    const from = state.basis.f, angle = Math.acos(clamp(dot(from, target), -1, 1));
    if (angle < 1e-6) return;
    const c = cross(from, target), axis = Math.hypot(...c) < 1e-9 ? state.basis.u : normalize(c);
    if (!animate) { set({ basis: northUpBasis(target) }); return; }
    const t0 = performance.now(), duration = flyDuration(angle);
    const step = (now: number) => {
      const t = clamp((now - t0) / duration, 0, 1);
      set({ basis: northUpBasis(rotate(from, axis, angle * ease(t))) });
      animation = t < 1 ? requestAnimationFrame(step) : null;
    };
    animation = requestAnimationFrame(step);
  },
  cancel() {
    if (animation != null) cancelAnimationFrame(animation);
    animation = null;
  },
  /** A drag moves the sky with the pointer. A drag to the right shows the sky to the east. */
  dragBy(dxPx: number, dyPx: number, widthPx: number) {
    const degPerPx = (state.fov / widthPx) * 1.1;
    const [ra, dec] = vecToEq(state.basis.f);
    const nextDec = clamp(dec + dyPx * degPerPx, -89.5, 89.5);
    const nextRa = ra + (dxPx * degPerPx) / Math.max(0.15, Math.cos(dec * RAD));
    set({ basis: northUpBasis(eqToVec(nextRa, nextDec)) });
  },
  zoomBy(factor: number) {
    set({ fov: clamp(state.fov * factor, FOV_MIN, FOV_MAX) });
  },
};

export function useCamera(): CameraState {
  return useSyncExternalStore(camera.subscribe, camera.get);
}
