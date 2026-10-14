/** Phase fold and bins for the fold plot. Times and periods are in days. Offsets are returned in hours. */

/** Time offset from the nearest event at t0 + n * period, in hours, in the range [-period/2, period/2). */
export function offsetHours(t: number, t0: number, period: number): number {
  let ph = ((t - t0) / period) % 1;
  if (ph >= 0.5) ph -= 1;
  if (ph < -0.5) ph += 1;
  return ph * period * 24;
}

export interface Folded { x: Float32Array; y: Float32Array; n: number }

/** Points within ±windowHours of an event. A range [t0, t1] limits the input times when it is given. */
export function fold(time: Float64Array, flux: Float64Array, t0: number, period: number, windowHours: number, range: [number, number] | null): Folded {
  const x = new Float32Array(time.length), y = new Float32Array(time.length);
  let n = 0;
  for (let i = 0; i < time.length; i++) {
    const t = time[i]!, f = flux[i]!;
    if (!Number.isFinite(t) || !Number.isFinite(f)) continue;
    if (range && (t < range[0] || t > range[1])) continue;
    const h = offsetHours(t, t0, period);
    if (Math.abs(h) > windowHours) continue;
    x[n] = h; y[n] = f; n++;
  }
  return { x: x.subarray(0, n), y: y.subarray(0, n), n };
}

export interface Bin { x: number; mean: number; se: number; n: number }

/** Mean and standard error in bins of width binHours. A bin needs at least minCount points. */
export function bins(f: Folded, windowHours: number, binHours: number, minCount = 4): Bin[] {
  const nb = Math.ceil((2 * windowHours) / binHours), sum = new Float64Array(nb), sq = new Float64Array(nb), cnt = new Int32Array(nb);
  for (let i = 0; i < f.n; i++) {
    const k = Math.min(nb - 1, Math.max(0, Math.floor((f.x[i]! + windowHours) / binHours)));
    sum[k]! += f.y[i]!; sq[k]! += f.y[i]! * f.y[i]!; cnt[k]!++;
  }
  const out: Bin[] = [];
  for (let k = 0; k < nb; k++) {
    const c = cnt[k]!;
    if (c < minCount) continue;
    const mean = sum[k]! / c, variance = Math.max(0, (sq[k]! / c - mean * mean) * (c / (c - 1)));
    out.push({ x: -windowHours + (k + 0.5) * binHours, mean, se: Math.sqrt(variance / c), n: c });
  }
  return out;
}
