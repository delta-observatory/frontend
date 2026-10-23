import { useEffect, useMemo, useRef } from "react";
import type { Evidence } from "../data/evidence";
import { colors } from "../theme";
import { bins, fold, foldBinHours, foldWindowHours, offsetHours } from "./fold";
import { clipPlot, drawAxes, drawLegend, drawReadout, type Frame } from "./surface";
import { usePlot } from "./usePlot";

interface Props { fullCycle?: boolean; ev: Evidence; brush: [number, number] | null; cursorT: number | null; foldP: number | null }

/**
 * Flattened flux folded at the BLS period, or at a display period from the periodogram.
 * The box model shows only for the stored result. A display fold is not a stored result.
 */
export function Fold({ ev, brush, cursorT, foldP, fullCycle = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const { surface, size } = usePlot(box);
  const best = ev.summary.best, P = foldP ?? best.period, T0 = best.transit_time, display = foldP != null;
  const win = fullCycle ? P * 12 : foldWindowHours(best.duration, P), binH = foldBinHours(win);

  const folded = useMemo(() => fold(ev.prepared.time!, ev.prepared.flattened_flux!, T0, P, win, brush), [ev, T0, P, win, brush]);
  const binned = useMemo(() => bins(folded, win, binH), [folded, win, binH]);
  const frame = useMemo((): Frame => {
    const lo = Math.min(1 - best.depth * 1.6, ...binned.map((b) => b.mean - 4 * b.se)), hi = Math.max(1 + best.depth * 0.5, ...binned.map((b) => b.mean + 4 * b.se));
    return { x0: -win, x1: win, y0: lo, y1: hi };
  }, [binned, best, win]);

  useEffect(() => {
    if (!surface) return;
    surface.clear();
    surface.addPoints(folded.x, folded.y, { color: colors.obs, alpha: 0.38, size: 1.6 });
  }, [surface, folded]);

  useEffect(() => {
    if (!surface) return;
    surface.setFrame(frame);
    surface.setRange(null);
    const mp = surface.map(), { w, h, m } = mp, narrow = w < 640;
    drawAxes(surface.ctx("under"), mp, frame, {
      title: display ? (narrow ? `DISPLAY FOLD · P ${P.toFixed(5)} d · not stored` : `DISPLAY FOLD · P ${P.toFixed(6)} d · not a stored result · Esc resets`) : (narrow ? `FOLD · BLS P ${P.toFixed(5)} d · stored` : `PHASE FOLD · BLS P ${P.toFixed(6)} d · stored result`),
      titleColor: display ? colors.textStrong : colors.text, xlabel: "time from BLS mid-transit  h", ylabel: "flattened flux  1", fy: (v) => v.toFixed(4),
    });
    surface.render();
    const ctx = surface.ctx("over");
    clipPlot(ctx, mp);
    ctx.strokeStyle = ctx.fillStyle = colors.textStrong; ctx.lineWidth = 1;
    for (const b of binned) { const x = mp.X(b.x); ctx.beginPath(); ctx.moveTo(x, mp.Y(b.mean - b.se)); ctx.lineTo(x, mp.Y(b.mean + b.se)); ctx.stroke(); ctx.fillRect(x - 1.5, mp.Y(b.mean) - 1.5, 3, 3); }
    if (!display) {
      const hd = (best.duration * 24) / 2;
      ctx.strokeStyle = colors.model; ctx.lineWidth = 1.4; ctx.setLineDash([6, 3]); ctx.beginPath();
      ctx.moveTo(mp.X(-win), mp.Y(1)); ctx.lineTo(mp.X(-hd), mp.Y(1)); ctx.lineTo(mp.X(-hd), mp.Y(1 - best.depth));
      ctx.lineTo(mp.X(hd), mp.Y(1 - best.depth)); ctx.lineTo(mp.X(hd), mp.Y(1)); ctx.lineTo(mp.X(win), mp.Y(1)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (cursorT != null) {
      const hr = offsetHours(cursorT, T0, P);
      if (Math.abs(hr) <= win) { ctx.strokeStyle = colors.textStrong; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(mp.X(hr), m.t); ctx.lineTo(mp.X(hr), h - m.b); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.restore();
    drawLegend(ctx, [
      { label: narrow ? "obs." : "observed", color: colors.obs, kind: "dot" }, { label: narrow ? `${(binH * 60).toFixed(0)} min ± s.e.` : `${(binH * 60).toFixed(0)}-min mean ± s.e.`, color: colors.textStrong, kind: "tick" },
      ...(display ? [] : [{ label: narrow ? "box model" : "box model (BLS)", color: colors.model, dash: [6, 3] }]),
    ]);
    drawReadout(ctx, w, narrow ? `${folded.n} pts` : `${folded.n} points${brush ? " in the time selection" : ""}`);
  }, [surface, size, frame, binned, folded, display, P, T0, win, binH, best, cursorT, brush]);

  return <div className="plot" ref={box} />;
}
