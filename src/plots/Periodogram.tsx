import { useEffect, useMemo, useRef } from "react";
import type { Evidence } from "../data/evidence";
import { colors } from "../theme";
import { clipPlot, drawAxes, drawLegend, drawReadout, type Frame } from "./surface";
import { nearest, usePlot } from "./usePlot";

interface Props {
  ev: Evidence;
  foldP: number | null;
  cursorP: number | null;
  onFoldP: (p: number | null) => void;
  onCursorP: (p: number | null) => void;
}

/** BLS power against trial period, with a log period axis. A click on a peak sets the display period of the fold. */
export function Periodogram({ ev, foldP, cursorP, onFoldP, onCursorP }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const { surface, size } = usePlot(box);
  const s = ev.summary, best = s.best;
  const objective = String((ev.job.diagnostics as { objective?: string } | null)?.objective ?? "");

  // Sorted by period, with the log of the period for the axis.
  const data = useMemo(() => {
    const P = ev.periodogram.period!, W = ev.periodogram.power!, idx = Array.from(P.keys()).sort((a, b) => P[a]! - P[b]!);
    const period = Float64Array.from(idx, (i) => P[i]!), power = Float64Array.from(idx, (i) => W[i]!);
    return { period, power, logP: period.map(Math.log), maxPower: power.reduce((a, b) => (b > a ? b : a), 0) };
  }, [ev]);

  const frame = useMemo((): Frame => ({
    x0: Math.log(Math.min(data.period[0]!, s.grid_period_min_days) * 0.97), x1: Math.log(s.grid_period_max_days * 1.05), y0: 0, y1: data.maxPower * 1.1, logx: true,
  }), [data, s]);

  useEffect(() => {
    if (!surface) return;
    surface.clear();
    surface.addLine(data.logP, data.power, { color: "#b9c3cf", alpha: 0.9 });
  }, [surface, data]);

  useEffect(() => {
    if (!surface) return;
    surface.setFrame(frame);
    surface.setRange(null);
    const mp = surface.map(), { w, h, m } = mp;
    drawAxes(surface.ctx("under"), mp, frame, {
      title: "BLS PERIODOGRAM · click a peak to fold at its period", xlabel: "trial period  d",
      ylabel: objective === "likelihood" ? "power, Δ log L  1" : "power  1", fy: (v) => (v >= 1e4 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)),
    });
    surface.render();
    const ctx = surface.ctx("over");
    clipPlot(ctx, mp);
    const vline = (p: number, color: string, dash: number[]) => { ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(mp.X(p), m.t); ctx.lineTo(mp.X(p), h - m.b); ctx.stroke(); ctx.setLineDash([]); };
    ctx.font = "10px 'IBM Plex Mono'"; ctx.textAlign = "center"; ctx.fillStyle = "#3d4a5c";
    for (const [k, label] of [[0.5, "P/2"], [2, "2P"], [3, "3P"]] as const) { vline(best.period * k, "#3d4a5c", [2, 3]); ctx.fillText(label, mp.X(best.period * k), h - m.b - 6); }
    if (ev.planet) {
      const P = ev.planet.period_days;
      if (P <= s.grid_period_max_days) vline(P, colors.ref, [5, 3]);
      else { ctx.fillStyle = colors.ref; ctx.textAlign = "right"; ctx.fillText(`reference P ${P.toFixed(4)} d is outside the search grid →`, w - m.r - 4, m.t + 14); }
    }
    s.peaks.forEach((pk, i) => {
      const x = mp.X(pk.period), y = mp.Y(pk.power);
      ctx.strokeStyle = ctx.fillStyle = i === 0 ? colors.model : colors.dim;
      ctx.beginPath(); ctx.arc(x, y, i === 0 ? 4 : 3, 0, 2 * Math.PI); ctx.stroke();
      ctx.textAlign = "left"; ctx.fillText(String(i + 1), x + 5, y - 3);
    });
    if (foldP) vline(foldP, colors.textStrong, [1, 2]);
    if (cursorP) vline(cursorP, "rgba(255,255,255,.35)", []);
    ctx.restore();
    drawLegend(ctx, [
      { label: "BLS power", color: "#b9c3cf" }, { label: "stored peaks 1–5", color: colors.model, kind: "dot" },
      ...(ev.planet ? [{ label: "reference P", color: colors.ref, dash: [5, 3] }] : []), { label: "P/2, 2P, 3P", color: "#3d4a5c", dash: [2, 3] },
    ]);
    if (cursorP) { const i = nearest(data.period, cursorP); drawReadout(ctx, w, `P ${data.period[i]!.toFixed(5)} d   power ${data.power[i]!.toFixed(1)}`); }
  }, [surface, size, ev, frame, foldP, cursorP, data, s, best, objective]);

  const at = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect(), mp = surface!.map(), x = clientX - r.left;
    return { mp, x, p: mp.invX(x), inside: mp.inside(x, clientY - r.top) };
  };
  return (
    <div
      className="plot" ref={box}
      onPointerMove={(e) => { if (surface) { const q = at(e.clientX, e.clientY); onCursorP(q.inside ? q.p : null); } }}
      onPointerLeave={() => onCursorP(null)}
      onClick={(e) => {
        if (!surface) return;
        const q = at(e.clientX, e.clientY);
        if (!q.inside) return;
        // The highest power within 5 px of the click.
        let bi = -1, bp = -Infinity;
        for (let i = 0; i < data.period.length; i++) { if (Math.abs(q.mp.X(data.period[i]!) - q.x) <= 5 && data.power[i]! > bp) { bp = data.power[i]!; bi = i; } }
        if (bi < 0) return;
        const p = data.period[bi]!;
        onFoldP(Math.abs(p / best.period - 1) < 1e-9 ? null : p);
      }}
      onDoubleClick={() => onFoldP(null)}
    />
  );
}
