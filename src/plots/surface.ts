import * as THREE from "three";
import { colors } from "../theme";

/**
 * A plot surface with three stacked layers:
 * 1. a 2D canvas for the background, the grid, and the tick labels,
 * 2. a WebGL canvas for the data points and long lines,
 * 3. a 2D canvas for models, marks, the cursor, the legend, and the readout.
 * GL data is stored relative to an origin, so that float32 keeps the precision of times and fluxes.
 */

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

const VERTEX = /* glsl */ `
attribute vec2 aData;
uniform vec2 uScale;
uniform vec2 uOffset;
uniform vec2 uRes;
uniform float uSize;
uniform float uDpr;
uniform vec2 uRange;
uniform float uUseRange;
varying float vIn;
void main() {
  vec2 px = aData * uScale + uOffset;
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uSize * uDpr;
  vIn = (uUseRange < 0.5 || (aData.x >= uRange.x && aData.x <= uRange.y)) ? 1.0 : 0.0;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uDimAlpha;
varying float vIn;
void main() {
  gl_FragColor = vec4(uColor, uAlpha * mix(uDimAlpha, 1.0, vIn));
}
`;

export interface SeriesStyle { color: string; alpha: number; size?: number; dimAlpha?: number }

interface Series { object: THREE.Points | THREE.LineSegments | THREE.Line; material: THREE.ShaderMaterial; originX: number; originY: number }

export class PlotSurface {
  readonly under: HTMLCanvasElement;
  readonly gl: HTMLCanvasElement;
  readonly over: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera();
  private series: Series[] = [];
  private frame: Frame = { x0: 0, x1: 1, y0: 0, y1: 1 };
  private range: [number, number] | null = null;
  layout: Layout = { w: 1, h: 1, m: MARGIN, pw: 1, ph: 1 };

  constructor(container: HTMLElement) {
    const mk = (cls: string) => { const c = document.createElement("canvas"); c.className = cls; container.appendChild(c); return c; };
    this.under = mk("plot-under");
    this.gl = mk("plot-gl");
    this.over = mk("plot-over");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.gl, antialias: true, alpha: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
  }

  /** Sizes all three layers to the container. Returns the CSS size. */
  resize(): { w: number; h: number } {
    const r = this.under.parentElement!.getBoundingClientRect(), dpr = devicePixelRatio || 1, w = Math.max(1, r.width), h = Math.max(1, r.height);
    for (const c of [this.under, this.over]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = `${w}px`; c.style.height = `${h}px`; }
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.layout = { ...mapping(w, h, this.frame) };
    return { w, h };
  }

  ctx(which: "under" | "over"): CanvasRenderingContext2D {
    const c = which === "under" ? this.under : this.over, ctx = c.getContext("2d")!;
    ctx.setTransform(devicePixelRatio || 1, 0, 0, devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    return ctx;
  }

  clear() {
    for (const s of this.series) { this.scene.remove(s.object); s.object.geometry.dispose(); s.material.dispose(); }
    this.series = [];
  }

  private material(style: SeriesStyle) {
    const c = new THREE.Color(style.color);
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uScale: { value: new THREE.Vector2() }, uOffset: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(1, 1) },
        uSize: { value: style.size ?? 1.5 }, uDpr: { value: 1 }, uRange: { value: new THREE.Vector2() }, uUseRange: { value: 0 },
        uColor: { value: new THREE.Vector3(c.r, c.g, c.b) }, uAlpha: { value: style.alpha }, uDimAlpha: { value: style.dimAlpha ?? 1 },
      },
    });
  }

  private geometry(x: ArrayLike<number>, y: ArrayLike<number>, n: number, originX: number, originY: number) {
    const a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { a[2 * i] = x[i]! - originX; a[2 * i + 1] = y[i]! - originY; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("aData", new THREE.BufferAttribute(a, 2));
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    return g;
  }

  /** Point series. NaN values are skipped. */
  addPoints(x: ArrayLike<number>, y: ArrayLike<number>, style: SeriesStyle) {
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]!) && Number.isFinite(y[i]!)) { xs.push(x[i]!); ys.push(y[i]!); }
    const ox = xs[0] ?? 0, oy = ys[0] ?? 0;
    const m = this.material(style), o = new THREE.Points(this.geometry(xs, ys, xs.length, ox, oy), m);
    o.frustumCulled = false;
    this.scene.add(o);
    this.series.push({ object: o, material: m, originX: ox, originY: oy });
  }

  /** Line series. A gap in x larger than maxGap, or a NaN value, breaks the line. */
  addLine(x: ArrayLike<number>, y: ArrayLike<number>, style: SeriesStyle, maxGap = Infinity) {
    const xs: number[] = [], ys: number[] = [];
    for (let i = 1; i < x.length; i++) {
      const a = x[i - 1]!, b = x[i]!, c = y[i - 1]!, d = y[i]!;
      if (![a, b, c, d].every(Number.isFinite) || b - a > maxGap) continue;
      xs.push(a, b); ys.push(c, d);
    }
    const ox = xs[0] ?? 0, oy = ys[0] ?? 0;
    const m = this.material(style), o = new THREE.LineSegments(this.geometry(xs, ys, xs.length, ox, oy), m);
    o.frustumCulled = false;
    this.scene.add(o);
    this.series.push({ object: o, material: m, originX: ox, originY: oy });
  }

  /** Data points outside [x0, x1] use their dim alpha. Null shows all points at full alpha. */
  setRange(range: [number, number] | null) { this.range = range; }

  setFrame(f: Frame) { this.frame = f; this.layout = mapping(this.layout.w, this.layout.h, f); }

  map(): Mapping { return mapping(this.layout.w, this.layout.h, this.frame); }

  render() {
    const { w, h, m, pw, ph } = this.layout, f = this.frame, dpr = devicePixelRatio || 1;
    const sx = pw / (f.x1 - f.x0), sy = ph / (f.y1 - f.y0);
    for (const s of this.series) {
      const u = s.material.uniforms;
      u.uScale!.value.set(sx, sy);
      u.uOffset!.value.set(m.l + (s.originX - f.x0) * sx, m.b + (s.originY - f.y0) * sy);
      u.uRes!.value.set(w, h);
      u.uDpr!.value = dpr;
      u.uUseRange!.value = this.range ? 1 : 0;
      if (this.range) u.uRange!.value.set(this.range[0] - s.originX, this.range[1] - s.originX);
    }
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(m.l, m.b, pw, ph);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.clear();
    this.renderer.dispose();
    for (const c of [this.under, this.gl, this.over]) c.remove();
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
