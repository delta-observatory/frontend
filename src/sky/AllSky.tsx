import { useEffect, useRef, type MouseEvent, type RefObject } from "react";
import { statusOf, type Target } from "../data/catalogue";
import { motion } from "../motion";
import { colors } from "../theme";
import { camera, useCamera } from "./camera";
import type { StarColumns } from "./layers";
import { clamp, eqToVec, projectionScale, RAD, unproject, vecToEq } from "./math";

const STATUS = { match: colors.stMatch, near: colors.stNear, miss: colors.stMiss, signal: colors.stSignal, eb: colors.stEb, quiet: colors.stQuiet };

/** Hammer projection of the whole sky. RA 0 is at the center, and RA increases to the left. */
function hammer(w: number, h: number) {
  const R = Math.min(w / (4 * Math.SQRT2), (h - 22) / (2 * Math.SQRT2)) * 0.96, cx = w / 2, cy = h / 2 + 9;
  const fwd = (ra: number, dec: number): [number, number] => {
    const l = -((((ra + 180) % 360) + 360) % 360 - 180) * RAD, b = dec * RAD, z = Math.sqrt(1 + Math.cos(b) * Math.cos(l / 2));
    return [cx + (R * 2 * Math.SQRT2 * Math.cos(b) * Math.sin(l / 2)) / z, cy - (R * Math.SQRT2 * Math.sin(b)) / z];
  };
  const inv = (x: number, y: number): [number, number] | null => {
    const xs = (x - cx) / R, ys = (cy - y) / R, z2 = 1 - (xs / 4) ** 2 - (ys / 2) ** 2;
    if (z2 < 0.5) return null;
    const z = Math.sqrt(z2), l = 2 * Math.atan2(z * xs, 2 * (2 * z2 - 1)), b = Math.asin(clamp(z * ys, -1, 1));
    return [((-l / RAD) % 360 + 360) % 360, b / RAD];
  };
  return { R, cx, cy, fwd, inv };
}

function marker(ctx: CanvasRenderingContext2D, cls: Target["cls"], x: number, y: number, s: number) {
  ctx.beginPath();
  if (cls === "planet_host") ctx.arc(x, y, s, 0, 2 * Math.PI);
  else if (cls === "no_known_planet") ctx.rect(x - s, y - s, 2 * s, 2 * s);
  else { ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x + s * 1.3, y); ctx.lineTo(x, y + s * 1.3); ctx.lineTo(x - s * 1.3, y); ctx.closePath(); }
  ctx.stroke();
}

interface Props { targets: Target[]; stars: StarColumns | null; selected: string | null; matches: Set<string>; sky: RefObject<HTMLDivElement | null>; flagged?: Set<string> }

/** Overview of the whole sky with every target and the outline of the current view. A click turns the view there. */
export function AllSky({ targets, stars, selected, matches, sky, flagged }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const background = useRef<HTMLCanvasElement | null>(null);
  const { basis, fov } = useCamera();

  useEffect(() => {
    const c = ref.current!, dpr = devicePixelRatio || 1, r = c.getBoundingClientRect();
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); background.current = null; }
    const w = r.width, h = r.height, H = hammer(w, h);
    if (!background.current && stars) {
      const b = document.createElement("canvas"); b.width = c.width; b.height = c.height;
      const g = b.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#04060b"; g.fillRect(0, 0, w, h);
      g.beginPath(); g.ellipse(H.cx, H.cy, H.R * 2 * Math.SQRT2, H.R * Math.SQRT2, 0, 0, 2 * Math.PI); g.fillStyle = colors.bg; g.fill(); g.strokeStyle = "#26303d"; g.stroke();
      g.strokeStyle = "#111821";
      for (let d = -60; d <= 60; d += 30) { g.beginPath(); for (let ra = 180.01; ra <= 539.99; ra += 3) { const p = H.fwd(ra % 360, d); ra > 180.02 ? g.lineTo(...p) : g.moveTo(...p); } g.stroke(); }
      for (let ra = 0; ra < 360; ra += 60) { if (ra === 180) continue; g.beginPath(); for (let d = -90; d <= 90; d += 3) { const p = H.fwd(ra, d); d === -90 ? g.moveTo(...p) : g.lineTo(...p); } g.stroke(); }
      g.fillStyle = colors.dim;
      for (let i = 0; i < stars.ra.length; i++) { const m = stars.mag[i]!; if (m > 4.5) continue; const p = H.fwd(stars.ra[i]!, stars.dec[i]!); const s = m < 2 ? 1.6 : 1; g.fillRect(p[0], p[1], s, s); }
      g.font = "10px 'IBM Plex Mono'"; g.textAlign = "center";
      for (const [ra, lab] of [[0, "0h"], [90, "6h"], [270, "18h"]] as const) { const p = H.fwd(ra, 0); g.fillText(lab, p[0], p[1] - 3); }
      background.current = b;
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (background.current) ctx.drawImage(background.current, 0, 0); else { ctx.fillStyle = "#04060b"; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Outline of the visible sky: the edge of the sky view, mapped back to the sphere.
    const el = sky.current;
    if (el) {
      const sw = el.clientWidth, sh = el.clientHeight, k = projectionScale(sw, fov), pts: [number, number][] = [];
      const n = 30;
      for (let i = 0; i < n; i++) pts.push([-sw / 2 + (sw * i) / n, -sh / 2]);
      for (let i = 0; i < n; i++) pts.push([sw / 2, -sh / 2 + (sh * i) / n]);
      for (let i = 0; i < n; i++) pts.push([sw / 2 - (sw * i) / n, sh / 2]);
      for (let i = 0; i <= n; i++) pts.push([-sw / 2, sh / 2 - (sh * i) / n]);
      ctx.strokeStyle = colors.text; ctx.lineWidth = 1; ctx.beginPath();
      let last: [number, number] | null = null;
      for (const [x, y] of pts) {
        const [ra, dec] = vecToEq(unproject(x, y, basis, k)), q = H.fwd(ra, dec);
        if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < H.R) ctx.lineTo(...q); else ctx.moveTo(...q);
        last = q;
      }
      ctx.stroke();
      const [ra0, dec0] = vecToEq(basis.f), q = H.fwd(ra0, dec0);
      ctx.beginPath(); ctx.moveTo(q[0] - 4, q[1]); ctx.lineTo(q[0] + 4, q[1]); ctx.moveTo(q[0], q[1] - 4); ctx.lineTo(q[0], q[1] + 4); ctx.stroke();
    }
    for (const t of targets) {
      if (t.ra == null || t.dec == null) continue;
      const p = H.fwd(t.ra, t.dec), sel = t.id === selected;
      ctx.globalAlpha = sel || matches.has(t.id) ? 1 : 0.25;
      ctx.strokeStyle = sel ? colors.textStrong : STATUS[statusOf(t)]; ctx.lineWidth = 1.2;
      marker(ctx, t.cls ?? "planet_host", p[0], p[1], sel ? 4 : 2.5);
      if (flagged?.has(t.id)) { ctx.strokeStyle = colors.text; ctx.setLineDash([2, 1.5]); ctx.strokeRect(p[0] - 5, p[1] - 5, 10, 10); ctx.setLineDash([]); }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.dim; ctx.font = "10px 'IBM Plex Mono'"; ctx.textAlign = "left";
    ctx.fillText(w < 280 ? "ALL SKY" : "ALL SKY · click to turn the view", 6, 12);
    ctx.textAlign = "right"; ctx.fillText(w < 280 ? `${matches.size}/${targets.length}` : `${matches.size} / ${targets.length} shown`, w - 6, 12);
  }, [basis, fov, targets, stars, selected, matches, sky, flagged]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), p = hammer(r.width, r.height).inv(e.clientX - r.left, e.clientY - r.top);
    if (p) camera.flyTo(eqToVec(p[0], p[1]), motion.get() === "animated");
  };
  return <canvas ref={ref} className="allsky" onClick={onClick} />;
}
