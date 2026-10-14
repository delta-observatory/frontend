import { describe, expect, it } from "vitest";
import { bins, fold, offsetHours } from "./fold";

describe("phase fold", () => {
  it("measures the offset from the nearest event", () => {
    expect(offsetHours(10.1, 10, 1)).toBeCloseTo(2.4, 9);
    expect(offsetHours(10.9, 10, 1)).toBeCloseTo(-2.4, 9);
    expect(offsetHours(13, 10, 1)).toBeCloseTo(0, 9);
  });

  it("keeps points in the window and the time range", () => {
    const t = Float64Array.from([0, 0.05, 0.5, 1.02, 2.0]), f = Float64Array.from([1, 2, 3, 4, NaN]);
    const all = fold(t, f, 0, 1, 2, null);
    expect(Array.from(all.y)).toEqual([1, 2, 4]);
    expect(fold(t, f, 0, 1, 2, [0.9, 1.1]).n).toBe(1);
  });

  it("gives the mean and standard error of each bin", () => {
    const t = Float64Array.from([0, 0, 0, 0]), f = Float64Array.from([1, 2, 3, 4]);
    const [b] = bins(fold(t, f, 0, 1, 1, null), 1, 2, 4);
    expect(b!.mean).toBeCloseTo(2.5, 12);
    expect(b!.se).toBeCloseTo(Math.sqrt(5 / 3 / 4), 12);
  });
});
