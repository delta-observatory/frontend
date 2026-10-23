import { canvasDpr, context2d } from "../canvas";
import { statusOf, type Target } from "../data/catalogue";
import { colors, sky } from "../theme";
import { clamp, dot, ecliptic, eqToVec, galacticEquator, GALACTIC, RAD, type Basis, type Vec3 } from "./math";
import type { StarColumns } from "./types";

const LIMIT = Math.cos(2.6);
const STATUS = { match: colors.stMatch, near: colors.stNear, miss: colors.stMiss, signal: colors.stSignal, eb: colors.stEb, quiet: colors.stQuiet };
const rgba = (c: readonly number[]) => `rgba(${c[0]},${c[1]},${c[2]},${c[3] ?? 1})`;

/** The same stereographic projection as project(), without inverse trigonometry per star. */
export function projected(v: Vec3, basis: Basis, scale: number): [number, number] | null {
  const c = dot(v, basis.f);
  if (c < LIMIT) return null;
  const k = 2 * scale / (1 + c);
  return [dot(v, basis.r) * k, -dot(v, basis.u) * k];
}

/** Great-circle interpolation keeps constellation segments on the sky sphere. */
export function densify(points: Vec3[], maxStepDeg = 1): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!, angle = Math.acos(clamp(dot(a, b), -1, 1));
    const count = Math.max(1, Math.ceil(angle / (maxStepDeg * RAD)));
    for (let j = 0; j < count; j++) {
      const t = j / count, s = Math.sin(angle) || 1;
      const wa = angle < 1e-9 ? 1 - t : Math.sin((1 - t) * angle) / s;
      const wb = angle < 1e-9 ? t : Math.sin(t * angle) / s;
      out.push([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
    }
  }
  if (points.length) out.push(points[points.length - 1]!);
  return out;
}

interface Line { points: Vec3[]; color: string; dash: number }
interface Star { v: Vec3; mag: number; size: number; color: string; glow: boolean }

function starColor(bv: number | null): string {
  const t = clamp(((bv ?? 0.6) + 0.3) / 2, 0, 1);
  const c0 = [170, 196, 255], c1 = [255, 244, 232], c2 = [255, 196, 140];
  const [a, b, s] = t < 0.4 ? [c0, c1, t / 0.4] : [c1, c2, (t - 0.4) / 0.6];
  return `rgb(${[0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * s)).join(",")})`;
}

/** Cached background and an inexpensive marker pass. Camera changes alone rebuild the star field. */
export class SkyRenderer {
  private background = document.createElement("canvas");
  private band = document.createElement("canvas");
  private backgroundKey = "";
  private stars: Star[];
  private lines: Line[];

  constructor(private canvas: HTMLCanvasElement, stars: StarColumns | null, lines: number[][] | null) {
    context2d(canvas, false);
    context2d(this.background, false);
    context2d(this.band);
    this.stars = stars ? stars.ra.map((ra, i) => ({
      v: eqToVec(ra, stars.dec[i]!), mag: stars.mag[i]!, size: Math.max(1.6, (6.8 - stars.mag[i]!) * 1.3),
      color: starColor(stars.bv[i] ?? null), glow: stars.mag[i]! < 2.2,
    })) : [];
    const decs = [-60, -30, 30, 60].map((d) => Array.from({ length: 181 }, (_, i) => eqToVec(i * 2, d)));
    const ras = Array.from({ length: 12 }, (_, k) => Array.from({ length: 89 }, (_, i) => eqToVec(k * 30, -88 + i * 2)));
    this.lines = [
      ...[...decs, ...ras].map((points) => ({ points: densify(points), color: rgba(sky.grid), dash: 0 })),
      { points: densify(Array.from({ length: 181 }, (_, i) => eqToVec(i * 2, 0))), color: rgba(sky.gridEquator), dash: 0 },
      { points: densify(ecliptic(2)), color: rgba(sky.ecliptic), dash: 3 },
      { points: densify(galacticEquator(2)), color: rgba(sky.galactic), dash: 3 },
      ...(lines ?? []).map((line) => {
        const points: Vec3[] = [];
        for (let i = 0; i + 1 < line.length; i += 2) points.push(eqToVec(line[i]!, line[i + 1]!));
        return { points: densify(points), color: rgba(sky.constellation), dash: 0 };
      }),
    ];
  }

  /** Sample the smooth, decorative Milky Way model at bounded resolution, then interpolate. */
  private milkyWay(ctx: CanvasRenderingContext2D, basis: Basis, scale: number, w: number, h: number) {
    const bw = Math.max(1, Math.min(320, Math.ceil(w / 4))), bh = Math.max(1, Math.min(180, Math.ceil(h / 4)));
    this.band.width = bw; this.band.height = bh;
    const g = context2d(this.band), image = g.createImageData(bw, bh);
    // Rotate the camera basis once, rather than each pixel.
    const r = GALACTIC.map((row) => dot(row, basis.r)), u = GALACTIC.map((row) => dot(row, basis.u)), f = GALACTIC.map((row) => dot(row, basis.f));
    for (let y = 0; y < bh; y++) {
      const b = (h / 2 - (y + 0.5) * h / bh) / scale;
      for (let x = 0; x < bw; x++) {
        const a = ((x + 0.5) * w / bw - w / 2) / scale, q = (a * a + b * b) / 4, den = 1 + q;
        const gx = (a * r[0]! + b * u[0]! + (1 - q) * f[0]!) / den;
        const gy = (a * r[1]! + b * u[1]! + (1 - q) * f[1]!) / den;
        const gz = (a * r[2]! + b * u[2]! + (1 - q) * f[2]!) / den;
        const lat = Math.asin(clamp(gz, -1, 1)) / RAD;
        const cosLon = gx / (Math.hypot(gx, gy) || 1);
        const alpha = (Math.exp(-lat * lat / 32) + 0.45 * Math.exp(-lat * lat / 288)) * (0.4 + 0.6 * Math.pow(0.5 + 0.5 * cosLon, 1.5)) * sky.milkyWayAlpha;
        const i = (y * bw + x) * 4;
        image.data[i] = sky.milkyWay[0]; image.data[i + 1] = sky.milkyWay[1]; image.data[i + 2] = sky.milkyWay[2]; image.data[i + 3] = Math.round(alpha * 255);
      }
    }
    g.putImageData(image, 0, 0);
    ctx.drawImage(this.band, 0, 0, w, h);
  }

  private drawBackground(basis: Basis, fov: number, scale: number, w: number, h: number, dpr: number) {
    const ctx = context2d(this.background, false);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, w, h);
    this.milkyWay(ctx, basis, scale, w, h);
    ctx.lineWidth = 1;
    for (const line of this.lines) {
      ctx.strokeStyle = line.color; ctx.beginPath();
      let previous: [number, number] | null = null, along = 0;
      for (let i = 0; i < line.points.length; i++) {
        const v = line.points[i]!, p = projected(v, basis, scale);
        if (line.dash && i > 0) along += Math.acos(clamp(dot(line.points[i - 1]!, v), -1, 1)) / RAD;
        if (p && previous && (!line.dash || along % line.dash <= line.dash * 0.62)) {
          ctx.moveTo(w / 2 + previous[0], h / 2 + previous[1]); ctx.lineTo(w / 2 + p[0], h / 2 + p[1]);
        }
        previous = p;
      }
      ctx.stroke();
    }
    const zoom = Math.sqrt(clamp(110 / fov, 0.8, 2.2)), limit = 6 + 2 * clamp((110 - fov) / 70, 0, 1);
    ctx.globalCompositeOperation = "lighter";
    for (const star of this.stars) {
      const fade = clamp(limit + 0.5 - star.mag, 0, 1);
      if (!fade) continue;
      const p = projected(star.v, basis, scale);
      if (!p) continue;
      const x = w / 2 + p[0], y = h / 2 + p[1], radius = star.size * zoom / 2;
      if (x < -radius * 4 || y < -radius * 4 || x > w + radius * 4 || y > h + radius * 4) continue;
      ctx.fillStyle = star.color;
      if (star.glow) {
        // Concentric disks approximate the same Gaussian halo without a per-star image allocation.
        for (let j = 4; j >= 1; j--) {
          ctx.globalAlpha = fade * 0.045 * Math.exp(-(j * j) / 8);
          ctx.beginPath(); ctx.arc(x, y, radius * j, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(x, y, radius * 0.85, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  draw(basis: Basis, fov: number, scale: number, w: number, h: number, targets: Target[], matches: Set<string>, selected: string | null, hover: string | null) {
    if (w <= 0 || h <= 0) return;
    const dpr = canvasDpr(), width = Math.round(w * dpr), height = Math.round(h * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height || this.background.width !== width || this.background.height !== height) {
      this.canvas.width = this.background.width = width; this.canvas.height = this.background.height = height;
      this.backgroundKey = "";
    }
    const key = `${basis.f}:${fov}:${w}:${h}:${dpr}`;
    if (key !== this.backgroundKey) { this.drawBackground(basis, fov, scale, w, h, dpr); this.backgroundKey = key; }
    const ctx = context2d(this.canvas, false);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.background, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineWidth = 1.5;
    for (const t of targets) {
      if (!t.v) continue;
      const p = projected(t.v, basis, scale);
      if (!p) continue;
      const x = w / 2 + p[0], y = h / 2 + p[1], active = t.id === selected || t.id === hover, radius = active ? 6 : 4;
      if (x < -12 || y < -12 || x > w + 12 || y > h + 12) continue;
      ctx.strokeStyle = STATUS[statusOf(t)]; ctx.globalAlpha = active || matches.has(t.id) ? 1 : 0.22;
      ctx.beginPath();
      if (t.cls === "no_known_planet") ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
      else if (t.cls === "eclipsing_binary") {
        ctx.moveTo(x, y - radius * 1.3); ctx.lineTo(x + radius * 1.3, y); ctx.lineTo(x, y + radius * 1.3); ctx.lineTo(x - radius * 1.3, y); ctx.closePath();
      } else ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  dispose() { this.background.width = this.background.height = this.band.width = this.band.height = 0; }
}
