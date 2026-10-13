// Frame measurements for the in-app performance display.

const intervals: number[] = [];
const renders: number[] = [];
let last = 0;

/** Records one rendered frame. Gaps longer than 100 ms are idle time, not frame time. */
export function recordFrame(now: number, renderMs: number) {
  if (last && now - last < 100) push(intervals, now - last);
  push(renders, renderMs);
  last = now;
}

function push(a: number[], x: number) {
  a.push(x);
  if (a.length > 240) a.shift();
}

function p95(a: number[]): number | null {
  if (a.length < 10) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(0.95 * (s.length - 1))]!;
}

export const frameStats = () => ({ intervalP95: p95(intervals), renderP95: p95(renders) });

/** Time from navigation start to the first sky frame with targets, in ms. */
export const marks = { firstSky: null as number | null };
