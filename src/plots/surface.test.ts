import { afterEach, describe, expect, it, vi } from "vitest";
import { mapping, PlotSurface } from "./surface";

function fixture() {
  const draws: { x: number; y: number; alpha: number }[] = [];
  const ctx = { globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1,
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    fillRect(x: number, y: number) { draws.push({ x, y, alpha: ctx.globalAlpha }); },
  };
  const container = { appendChild: vi.fn(), getBoundingClientRect: () => ({ width: 500, height: 300 }) };
  vi.stubGlobal("window", { devicePixelRatio: 1 }); vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("document", { createElement: () => ({ style: {}, getContext: () => ctx, parentElement: container, remove: vi.fn() }) });
  const surface = new PlotSurface(container as unknown as HTMLElement); surface.resize();
  return { surface, ctx, draws };
}
afterEach(() => vi.unstubAllGlobals());

describe("CPU scientific plot data", () => {
  it("preserves nearby times, omits non-finite points, and dims only outside the selected range", () => {
    const { surface, draws, ctx } = fixture();
    surface.setFrame({ x0: 1354, x1: 1354.00002, y0: 0, y1: 2 });
    surface.addPoints([1354, 1354.00001, 1354.00002, NaN], [1, 1, 1, 1], { color: "white", alpha: .5, dimAlpha: .2 });
    surface.setRange([1354.000005, 1354.000015]); surface.render();
    expect(draws).toHaveLength(3);
    expect(draws.map((d) => d.alpha)).toEqual([.1, .5, .1]);
    expect(draws[1]!.x - draws[0]!.x).toBeCloseTo(215, 3);
    const count = ctx.clearRect.mock.calls.length; surface.render();
    expect(ctx.clearRect.mock.calls.length).toBe(count);
  });
  it("preserves line peaks and does not connect missing values or long time gaps", () => {
    const { surface, ctx } = fixture();
    surface.setFrame({ x0: 0, x1: 20, y0: 0, y1: 10 });
    surface.addLine([0, 1, 2, 3, 4, 5, 15, 16], [1, 9, 1, NaN, 1, 2, 2, 1], { color: "white", alpha: 1 }, 2);
    surface.render();
    expect(ctx.lineTo).toHaveBeenCalledTimes(4);
    expect(ctx.lineTo.mock.calls[0]![1]).toBeCloseTo(surface.map().Y(9));
    expect(ctx.moveTo.mock.calls[2]![0]).toBeCloseTo(surface.map().X(4));
    expect(ctx.moveTo.mock.calls[3]![0]).toBeCloseTo(surface.map().X(15));
  });
  it("uses the same log axis for drawing and pointer inversion", () => {
    const frame = { x0: Math.log(.2), x1: Math.log(20), y0: 0, y1: 5, logx: true };
    const mp = mapping(600, 300, frame);
    for (const p of [.2, .5, 2, 15, 20]) expect(mp.invX(mp.X(p))).toBeCloseTo(p, 10);
    const { surface, ctx } = fixture(); surface.setFrame(frame);
    surface.addLine([Math.log(.2), Math.log(2), Math.log(20)], [1, 4, 2], { color: "white", alpha: 1 }); surface.render();
    expect(ctx.lineTo.mock.calls[0]![0]).toBeCloseTo(surface.map().X(2));
  });
});
