import { describe, expect, it } from "vitest";
import { dot, eqToVec, northUpBasis, project, projectionScale, toGalactic, unproject, vecToEq } from "./math";

describe("sky geometry", () => {
  it("converts RA and Dec to a vector and back", () => {
    for (const [ra, dec] of [[0, 0], [24.35, -45.68], [328.74, -21.59], [227.87, 71.84]] as const) {
      const [r, d] = vecToEq(eqToVec(ra, dec));
      expect(r).toBeCloseTo(ra, 9);
      expect(d).toBeCloseTo(dec, 9);
    }
  });

  it("builds an orthonormal north-up basis with east to the left", () => {
    const b = northUpBasis(eqToVec(32, -38));
    expect(dot(b.f, b.r)).toBeCloseTo(0, 12);
    expect(dot(b.f, b.u)).toBeCloseTo(0, 12);
    expect(dot(b.r, b.u)).toBeCloseTo(0, 12);
    // A point at larger RA (east) is to the left. A point at larger Dec is above.
    const k = projectionScale(1000, 100);
    expect(project(eqToVec(34, -38), b, k).x).toBeLessThan(0);
    expect(project(eqToVec(32, -36), b, k).y).toBeLessThan(0);
  });

  it("inverts the stereographic projection", () => {
    const b = northUpBasis(eqToVec(200, 30)), k = projectionScale(1600, 110);
    for (const [ra, dec] of [[200, 30], [230, 10], [150, 70], [260, -20]] as const) {
      const v = eqToVec(ra, dec), p = project(v, b, k), w = unproject(p.x, p.y, b, k);
      for (let i = 0; i < 3; i++) expect(w[i]).toBeCloseTo(v[i]!, 9);
    }
  });

  it("puts the galactic center at l = 0, b = 0", () => {
    const [l, b] = toGalactic(eqToVec(266.40499, -28.93617));
    expect(Math.min(l, 360 - l)).toBeLessThan(0.01);
    expect(Math.abs(b)).toBeLessThan(0.01);
  });
});
