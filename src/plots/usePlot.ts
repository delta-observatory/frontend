import { useEffect, useState, type RefObject } from "react";
import { PlotSurface } from "./surface";

/** Creates a plot surface in the container and resizes it with the container. `size` changes after each resize. */
export function usePlot(box: RefObject<HTMLDivElement | null>): { surface: PlotSurface | null; size: number } {
  const [surface, setSurface] = useState<PlotSurface | null>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = box.current!;
    const s = new PlotSurface(el);
    s.resize();
    setSurface(s);
    const ro = new ResizeObserver(() => { s.resize(); setSize((n) => n + 1); });
    ro.observe(el);
    return () => { ro.disconnect(); s.dispose(); setSurface(null); };
  }, [box]);
  return { surface, size };
}

/** Index of the value in a sorted array that is closest to x. */
export function nearest(a: Float64Array, x: number): number {
  let lo = 0, hi = a.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m]! < x) lo = m; else hi = m; }
  return Math.abs(a[lo]! - x) <= Math.abs(a[hi]! - x) ? lo : hi;
}

/** Values at the given quantiles, ignoring NaN. */
export function quantiles(a: ArrayLike<number>, qs: number[]): number[] {
  const v = Float64Array.from(a).filter(Number.isFinite).sort();
  return qs.map((q) => v[Math.min(v.length - 1, Math.max(0, Math.floor(q * (v.length - 1))))] ?? NaN);
}
