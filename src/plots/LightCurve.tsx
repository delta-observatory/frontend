import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import type { Evidence } from "../data/evidence";
import { colors } from "../theme";
import { clipPlot, drawAxes, drawLegend, drawReadout, type Frame, type LegendItem } from "./surface";
import { nearest, quantiles, usePlot } from "./usePlot";

/** "BJD 2457000.0" in the contract means that the stored time is BJD minus 2457000.0. */
function timeLabel(reference?: string, scale?: string): string {
  const m = /^(\w+) ([\d.]+)$/.exec(reference ?? "");
  const base = m ? `${m[1]} − ${m[2]}` : reference ?? "";
  return scale ? `${base} (${scale.toUpperCase()})` : base;
}

interface Props {
  ev: Evidence;
  brush: [number, number] | null;
  cursorT: number | null;
  foldP: number | null;
  onBrush: (b: [number, number] | null) => void;
  onCursorT: (t: number | null) => void;
}

/** Prepared flux against time. Points are observations. The dashed line is the fitted trend. Marks show predicted event times. */
export function LightCurve({ ev, brush, cursorT, foldP, onBrush, onCursorT }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const { surface, size } = usePlot(box);
  const p = ev.prepared, time = p.time!, flux = p.normalized_flux!, trend = p.trend!, best = ev.summary.best;
  const tMeta = ev.lightCurveMeta.time;

  const frame = useMemo((): Frame => {
    const [lo, hi] = quantiles(flux, [0.0015, 0.9985]) as [number, number], pad = (hi - lo) * 0.08;
    return { x0: ev.checks.time_min - 0.3, x1: ev.checks.time_max + 0.3, y0: lo - pad, y1: hi + pad };
  }, [ev, flux]);

  useEffect(() => {
    if (!surface) return;
    surface.clear();
    surface.addPoints(time, flux, { color: colors.obs, alpha: 0.55, size: 1.6, dimAlpha: 0.22 });
  }, [surface, time, flux]);

  useEffect(() => {
    if (!surface) return;
    surface.setFrame(frame);
    surface.setRange(brush);
    const mp = surface.map(), { w, h, m } = mp;
    drawAxes(surface.ctx("under"), mp, frame, {
      title: `LIGHT CURVE · ${ev.checks.flux_column}, normalized by the worker · drag to select a time range`,
      xlabel: `time  ${timeLabel(tMeta?.time_reference, tMeta?.time_scale)}  d`, ylabel: "normalized flux  1", fy: (v) => v.toFixed(4),
    });
    surface.render();
    const ctx = surface.ctx("over");
    clipPlot(ctx, mp);
    if (brush) { ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.fillRect(mp.X(brush[0]), m.t, mp.X(brush[1]) - mp.X(brush[0]), mp.ph); }
    // Fitted trend: a model, so it is a dashed line.
    ctx.strokeStyle = colors.model; ctx.lineWidth = 1.1; ctx.setLineDash([6, 3]); ctx.beginPath();
    let last = NaN;
    for (let i = 0; i < time.length; i += 2) {
      const t = time[i]!, y = trend[i]!;
      if (!Number.isFinite(y)) { last = NaN; continue; }
      if (t - last < 0.2) ctx.lineTo(mp.X(t), mp.Y(y)); else ctx.moveTo(mp.X(t), mp.Y(y));
      last = t;
    }
    ctx.stroke(); ctx.setLineDash([]);
    // Predicted event times: known planet (reference), BLS result, and the display period.
    const marks = (t0: number, period: number, y: number, color: string) => {
      ctx.strokeStyle = color; ctx.beginPath();
      for (let n = Math.ceil((frame.x0 - t0) / period); t0 + n * period < frame.x1; n++) { const x = mp.X(t0 + n * period); ctx.moveTo(x, m.t + y); ctx.lineTo(x, m.t + y + 7); }
      ctx.stroke();
    };
    if (ev.planet) marks(ev.planet.transit_midpoint_btjd_tdb, ev.planet.period_days, 2, colors.ref);
    marks(best.transit_time, best.period, 11, colors.model);
    if (foldP) marks(best.transit_time, foldP, 20, colors.textStrong);
    ctx.fillStyle = colors.flag;
    for (const t of ev.excluded.time) ctx.fillRect(mp.X(t), h - m.b - 5, 1, 4);
    if (cursorT != null) { ctx.strokeStyle = colors.textStrong; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(mp.X(cursorT), m.t); ctx.lineTo(mp.X(cursorT), h - m.b); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
    const items: LegendItem[] = [
      { label: "observed", color: colors.obs, kind: "dot" }, { label: "trend (fit)", color: colors.model, dash: [6, 3] },
      { label: "BLS transit times", color: colors.model, kind: "tick" },
      ...(ev.planet ? [{ label: "reference ephemeris", color: colors.ref, kind: "tick" as const }] : []),
      ...(foldP ? [{ label: "display period", color: colors.textStrong, kind: "tick" as const }] : []),
      { label: `excluded rows ${ev.checks.excluded}`, color: colors.flag, kind: "tick" },
    ];
    drawLegend(ctx, items);
    if (cursorT != null) {
      const i = nearest(time, cursorT);
      drawReadout(ctx, w, `t ${time[i]!.toFixed(5)} d   flux ${flux[i]!.toFixed(6)}   trend ${trend[i]!.toFixed(6)}`);
    } else if (brush) drawReadout(ctx, w, `selection ${brush[0].toFixed(3)}–${brush[1].toFixed(3)} d · Esc clears`);
  }, [surface, size, ev, frame, brush, cursorT, foldP, time, flux, trend, best, tMeta]);

  const start = useRef<number | null>(null);
  const toTime = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect(), mp = surface!.map();
    return { t: mp.invX(Math.min(Math.max(e.clientX - r.left, mp.m.l), mp.w - mp.m.r)), inside: mp.inside(e.clientX - r.left, e.clientY - r.top), px: e.clientX };
  };
  return (
    <div
      className="plot" ref={box}
      onPointerDown={(e) => { if (!surface) return; const p0 = toTime(e); if (!p0.inside) return; e.currentTarget.setPointerCapture(e.pointerId); start.current = p0.px; (e.currentTarget as HTMLDivElement).dataset.t0 = String(p0.t); }}
      onPointerMove={(e) => {
        if (!surface) return;
        const q = toTime(e);
        onCursorT(q.inside ? q.t : null);
        if (start.current != null && Math.abs(q.px - start.current) > 3) { const t0 = Number((e.currentTarget as HTMLDivElement).dataset.t0); onBrush([Math.min(t0, q.t), Math.max(t0, q.t)]); }
      }}
      onPointerUp={() => { start.current = null; }}
      onPointerLeave={() => onCursorT(null)}
      onDoubleClick={() => onBrush(null)}
    />
  );
}
