import { describe, expect, it } from "vitest";
import { densify, projected } from "./cpu";
import { eqToVec, northUpBasis, project, projectionScale } from "./math";

describe("software sky coordinates", () => {
  it("agrees with the interaction projection across poles, the RA seam, and zoom levels", () => {
    for (const ra of [0, 91, 180, 359.9]) for (const dec of [-89.5, -38, 0, 89.5]) {
      const basis = northUpBasis(eqToVec(ra, dec));
      for (const fov of [12, 40, 110, 150]) for (let a = 0; a < 360; a += 15) for (let d = -90; d <= 90; d += 15) {
        const v = eqToVec(a, d), scale = projectionScale(1600, fov);
        const expected = project(v, basis, scale), actual = projected(v, basis, scale);
        if (expected.theta > 2.6) expect(actual).toBeNull();
        else {
          expect(actual).not.toBeNull();
          expect(actual![0]).toBeCloseTo(expected.x, 6);
          expect(actual![1]).toBeCloseTo(expected.y, 6);
        }
      }
    }
  });

  it("keeps lines on the sphere across the RA seam", () => {
    const line = densify([eqToVec(359, 0), eqToVec(1, 0)]);
    expect(line.length).toBeGreaterThanOrEqual(3);
    for (const p of line) {
      expect(Math.hypot(...p)).toBeCloseTo(1, 12);
      expect(p[0]).toBeGreaterThan(0.99);
    }
    expect(densify([])).toEqual([]);
  });
});
