export type Range = [number, number];
/** Bound a display range without changing its width at an edge. */
export function boundRange(range: Range, extent: Range, minimum = 0.01): Range {
  const [lo, hi] = extent;
  if (![...range, lo, hi].every(Number.isFinite) || hi <= lo) return extent;
  const width = Math.min(hi - lo, Math.max(minimum, range[1] - range[0]));
  const left = Math.max(lo, Math.min(hi - width, range[0]));
  return [left, left + width];
}
export function zoomRange(range: Range, anchor: number, factor: number, extent: Range): Range {
  if (!Number.isFinite(anchor) || !Number.isFinite(factor) || factor <= 0) return range;
  const f = Math.max(0, Math.min(1, (anchor - range[0]) / (range[1] - range[0])));
  const width = Math.max(0.01, (range[1] - range[0]) * factor);
  return boundRange([anchor - f * width, anchor + (1 - f) * width], extent);
}
