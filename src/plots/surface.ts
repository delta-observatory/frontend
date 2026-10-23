import { colors } from "../theme";
import { canvasDpr, context2d } from "../canvas";

/** Three software canvas layers: axes, full-resolution data, and interactive marks. */

export interface Frame {
  x0: number; x1: number; y0: number; y1: number;
  /** When true, x data and x0, x1 are natural logarithms of the axis value. */
  logx?: boolean;
}

export interface Layout { w: number; h: number; m: { l: number; r: number; t: number; b: number }; pw: number; ph: number }

export interface Mapping extends Layout {
  /** Axis value to CSS pixels. For a log axis, X takes the axis value, not its logarithm. */
  X(v: number): number;
  Y(v: number): number;
  invX(px: number): number;
  invY(px: number): number;
  inside(px: number, py: number): boolean;
}

export const MARGIN = { l: 58, r: 12, t: 40, b: 30 };

export function mapping(w: number, h: number, f: Frame): Mapping {
  const m = MARGIN, pw = Math.max(1, w - m.l - m.r), ph = Math.max(1, h - m.t - m.b);
  const fx = f.logx ? Math.log : (v: number) => v, gx = f.logx ? Math.exp : (v: number) => v;
  return {
    w, h, m, pw, ph,
    X: (v) => m.l + ((fx(v) - f.x0) / (f.x1 - f.x0)) * pw,
    Y: (v) => h - m.b - ((v - f.y0) / (f.y1 - f.y0)) * ph,
    invX: (px) => gx(f.x0 + ((px - m.l) / pw) * (f.x1 - f.x0)),
    invY: (py) => f.y0 + ((h - m.b - py) / ph) * (f.y1 - f.y0),
    inside: (px, py) => px >= m.l && px <= w - m.r && py >= m.t && py <= h - m.b,
  };
}

export interface SeriesStyle { color: string; alpha: number; size?: number; dimAlpha?: number }
interface Series { kind: "points" | "line"; x: Float64Array; y: Float64Array; style: SeriesStyle; maxGap: number }

export class PlotSurface {
  readonly under: HTMLCanvasElement;
  readonly data: HTMLCanvasElement;
  readonly over: HTMLCanvasElement;
  private series: Series[] = [];
  private frame: Frame = { x0: 0, x1: 1, y0: 0, y1: 1 };
  private range: [number, number] | null = null;
  private dirty = true;
  layout: Layout = { w: 1, h: 1, m: MARGIN, pw: 1, ph: 1 };

  constructor(container: HTMLElement) {
    const make = (cls: string) => {
      const canvas = document.createElement("canvas");
      canvas.className = cls;
      context2d(canvas);
      container.appendChild(canvas);
      return canvas;
    };
    this.under = make("plot-under");
    this.data = make("plot-data");
    this.over = make("plot-over");
  }

  resize(): { w: number; h: number } {
    const r = this.under.parentElement!.getBoundingClientRect();
    const dpr = canvasDpr(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    for (const c of [this.under, this.data, this.over]) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = `${w}px`; c.style.height = `${h}px`;
    }
    this.layout = mapping(w, h, this.frame);
    this.dirty = true;
    return { w, h };
  }

  ctx(which: "under" | "over"): CanvasRenderingContext2D {
    const c = which === "under" ? this.under : this.over, ctx = context2d(c), dpr = canvasDpr();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.layout.w, this.layout.h);
    return ctx;
  }

  clear() { this.series = []; this.dirty = true; }

  /** Preserve every input point and double precision. Drawing skips non-finite values. */
  addPoints(x: ArrayLike<number>, y: ArrayLike<number>, style: SeriesStyle) {
    this.series.push({ kind: "points", x: Float64Array.from(x), y: Float64Array.from(y), style, maxGap: Infinity });
    this.dirty = true;
  }

  /** Preserve gaps and non-finite separators. Logarithmic x values arrive pre-transformed. */
  addLine(x: ArrayLike<number>, y: ArrayLike<number>, style: SeriesStyle, maxGap = Infinity) {
    this.series.push({ kind: "line", x: Float64Array.from(x), y: Float64Array.from(y), style, maxGap });
    this.dirty = true;
  }

  setRange(range: [number, number] | null) {
    if (this.range?.[0] !== range?.[0] || this.range?.[1] !== range?.[1]) this.dirty = true;
    this.range = range;
  }

  setFrame(f: Frame) {
    if (f.x0 !== this.frame.x0 || f.x1 !== this.frame.x1 || f.y0 !== this.frame.y0 || f.y1 !== this.frame.y1 || f.logx !== this.frame.logx) this.dirty = true;
    this.frame = f;
    this.layout = mapping(this.layout.w, this.layout.h, f);
  }

  map(): Mapping { return mapping(this.layout.w, this.layout.h, this.frame); }

  render() {
    if (!this.dirty) return;
    const ctx = context2d(this.data), { w, h, m, pw, ph } = this.layout, f = this.frame, dpr = canvasDpr();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    const sx = pw / (f.x1 - f.x0), sy = ph / (f.y1 - f.y0);
    const X = (x: number) => m.l + (x - f.x0) * sx;
    const Y = (y: number) => h - m.b - (y - f.y0) * sy;
    for (const s of this.series) {
      ctx.fillStyle = ctx.strokeStyle = s.style.color;
      ctx.globalAlpha = s.style.alpha;
      if (s.kind === "points") {
        const size = s.style.size ?? 1.5;
        for (let i = 0; i < Math.min(s.x.length, s.y.length); i++) {
          const x = s.x[i]!, y = s.y[i]!;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          const px = X(x), py = Y(y);
          if (px + size < m.l || px - size > w - m.r || py + size < m.t || py - size > h - m.b) continue;
          ctx.globalAlpha = s.style.alpha * (this.range && (x < this.range[0] || x > this.range[1]) ? s.style.dimAlpha ?? 1 : 1);
          ctx.fillRect(px - size / 2, py - size / 2, size, size);
        }
      } else {
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < Math.min(s.x.length, s.y.length); i++) {
          const a = s.x[i - 1]!, b = s.x[i]!, c = s.y[i - 1]!, d = s.y[i]!;
          if (![a, b, c, d].every(Number.isFinite) || b - a > s.maxGap) continue;
          // Keep every segment. The canvas clip preserves peaks at the plot boundary.
          ctx.moveTo(X(a), Y(c)); ctx.lineTo(X(b), Y(d));
        }
        ctx.stroke();
      }
    }
    ctx.restore();
    this.dirty = false;
  }

  dispose() {
    this.clear();
    for (const c of [this.under, this.data, this.over]) c.remove();
  }
}

// ---------- 2D axes ----------

export function niceTicks(a: number, b: number, n: number): number[] {
  const span = b - a;
  if (!(span > 0)) return [];
  const mag = Math.pow(10, Math.floor(Math.log10(span / n)));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

const LOG_TICKS = [0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100];

export interface AxesSpec { title: string; titleColor?: string; xlabel: string; ylabel: string; fx?: (v: number) => string; fy: (v: number) => string }

/** Background, grid, frame, tick labels, and titles on the under layer. */
export function drawAxes(ctx: CanvasRenderingContext2D, mp: Mapping, f: Frame, spec: AxesSpec) {
  const { w, h, m, pw, ph } = mp;
  ctx.fillStyle = "#04060b"; ctx.fillRect(0, 0, w, h);
  ctx.font = "10px 'IBM Plex Mono'"; ctx.lineWidth = 1;
  const xt = f.logx ? LOG_TICKS.filter((v) => Math.log(v) >= f.x0 && Math.log(v) <= f.x1) : niceTicks(f.x0, f.x1, Math.max(3, Math.floor(pw / 75)));
  const yt = niceTicks(f.y0, f.y1, Math.max(3, Math.floor(ph / 42)));
  ctx.strokeStyle = "#111821"; ctx.beginPath();
  for (const v of xt) { const x = Math.round(mp.X(v)) + 0.5; ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); }
  for (const v of yt) { const y = Math.round(mp.Y(v)) + 0.5; ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); }
  ctx.stroke();
  ctx.strokeStyle = "#26303d"; ctx.strokeRect(m.l + 0.5, m.t + 0.5, pw - 1, ph - 1);
  ctx.fillStyle = colors.dim; ctx.textAlign = "center";
  for (const v of xt) ctx.fillText(spec.fx ? spec.fx(v) : String(v), mp.X(v), h - m.b + 13);
  ctx.textAlign = "right";
  for (const v of yt) ctx.fillText(spec.fy(v), m.l - 5, mp.Y(v) + 3);
  ctx.textAlign = "left"; ctx.fillStyle = spec.titleColor ?? colors.text; ctx.font = "500 10px 'IBM Plex Mono'";
  ctx.fillText(spec.title, m.l, 13);
  ctx.fillStyle = colors.dim; ctx.font = "10px 'IBM Plex Mono'"; ctx.textAlign = "right";
  ctx.fillText(spec.xlabel, w - m.r, h - 4);
  ctx.save(); ctx.translate(11, m.t); ctx.rotate(-Math.PI / 2); ctx.fillText(spec.ylabel, 0, 0); ctx.restore();
}

export interface LegendItem { label: string; color: string; kind?: "dot" | "tick" | "line"; dash?: number[] }

export function drawLegend(ctx: CanvasRenderingContext2D, items: LegendItem[], x = MARGIN.l, y = 28) {
  ctx.font = "10px 'IBM Plex Mono'"; ctx.textAlign = "left";
  for (const it of items) {
    ctx.strokeStyle = ctx.fillStyle = it.color; ctx.setLineDash(it.dash ?? []); ctx.lineWidth = 1.2;
    if (it.kind === "dot") { ctx.beginPath(); ctx.arc(x + 6, y - 3, 1.8, 0, 2 * Math.PI); ctx.fill(); }
    else if (it.kind === "tick") { ctx.beginPath(); ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 6, y + 2); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 14, y - 3); ctx.stroke(); }
    ctx.setLineDash([]); ctx.fillStyle = colors.dim; ctx.fillText(it.label, x + 18, y);
    x += 32 + ctx.measureText(it.label).width;
  }
}

export function drawReadout(ctx: CanvasRenderingContext2D, w: number, text: string) {
  ctx.font = "10px 'IBM Plex Mono'"; ctx.textAlign = "right"; ctx.fillStyle = colors.text; ctx.fillText(text, w - MARGIN.r, 13);
}

/** Plot area clip for overlay drawing. Call ctx.restore() after drawing. */
export function clipPlot(ctx: CanvasRenderingContext2D, mp: Mapping) {
  ctx.save(); ctx.beginPath(); ctx.rect(mp.m.l + 1, mp.m.t + 1, mp.pw - 2, mp.ph - 2); ctx.clip();
}
