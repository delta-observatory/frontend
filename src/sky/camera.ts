import { useSyncExternalStore } from "react";
import { clamp, eqToVec, northUpBasis, RAD, vecToEq, type Basis } from "./math";

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
