// Client parity: the frontend copies of API rules must give the API results.
// vendor/api-vectors/ is a copy of backend tests/vectors/ (scripts/sync-api-vectors.sh). The API tests pass the same cases.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ParamSchema } from "./api/types";
import type { Target } from "./data/catalogue";
import { parseSearch } from "./data/search";
import { bins, fold, foldBinHours, foldWindowHours, offsetHours } from "./plots/fold";
import { check, failedConstraints, fields, getAt } from "./runs/params";

const vectors = (name: string) => JSON.parse(readFileSync(new URL(`../vendor/api-vectors/${name}`, import.meta.url), "utf8"));

describe("target-query/1 parity", () => {
  const data = vectors("target_query.json");
  const targets = data.targets.map((t: Record<string, never>) => ({
    id: t.id, tic: t.target_id, name: t.planet_name, snr: t.depth_snr, relErr: t.relative_period_error, period: t.period_days,
    refPeriod: t.reference_period_days, tmag: t.tmag, sector: t.sector,
  })) as unknown as Target[];
  for (const c of data.cases) {
    it(`query ${JSON.stringify(c.q)}`, () => {
      const s = parseSearch(c.q);
      expect(targets.filter(s.test).map((t) => t.id)).toEqual(c.match);
      expect(s.errors.length).toBe(c.error_count);
    });
  }
});

describe("fold-window/1 parity", () => {
  const data = vectors("fold.json");
  const time = Float64Array.from(data.time), flux = Float64Array.from(data.flux.map((x: number | null) => x ?? NaN));
  it("offsets", () => {
    for (const o of data.offsets) expect(offsetHours(o.t, o.t0, o.period)).toBeCloseTo(o.hours, 9);
  });
  data.cases.forEach((c: { period: number; t0: number; duration_days: number; time_range: [number, number] | null; window_hours: number; bin_hours: number; n_points: number; bins: { x_hours: number; mean: number; standard_error: number; n: number }[] }, i: number) => {
    it(`case ${i}: P ${c.period} d, range ${JSON.stringify(c.time_range)}`, () => {
      const w = foldWindowHours(c.duration_days, c.period);
      expect(w).toBeCloseTo(c.window_hours, 12);
      expect(foldBinHours(w)).toBeCloseTo(c.bin_hours, 12);
      const f = fold(time, flux, c.t0, c.period, w, c.time_range);
      expect(f.n).toBe(c.n_points);
      const got = bins(f, w, foldBinHours(w));
      expect(got.map((b) => b.n)).toEqual(c.bins.map((b) => b.n));
      got.forEach((b, k) => {
        const e = c.bins[k]!;
        expect(Math.abs(b.x - e.x_hours)).toBeLessThan(1e-9);
        expect(Math.abs(b.mean - e.mean)).toBeLessThan(1e-12);
        expect(Math.abs(b.se - e.standard_error)).toBeLessThan(1e-12);
      });
    });
  });
});

describe("parameter check parity", () => {
  const data = vectors("parameters.json");
  const schema = data.schema as ParamSchema & { "x-constraints": string[] };
  const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = structuredClone(a);
    for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" ? merge(out[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
    return out;
  };
  for (const c of data.cases) {
    it(`override ${JSON.stringify(c.override)}`, () => {
      const params = merge(data.defaults, c.override);
      const invalid = fields(schema).filter((f) => check(getAt(params, f.path), f.schema).length > 0).map((f) => f.key).sort();
      // The API reports an array item error at the item path, for example search.duration_days.0. The form shows it at the field.
      const expected = [...new Set((c.schema_paths as string[]).map((p) => p.replace(/\.\d+$/, "")))].sort();
      expect(invalid).toEqual(expected);
      const rules = invalid.length ? [] : failedConstraints(schema["x-constraints"], params).map((r) => r.rule);
      expect(rules).toEqual(c.rules);
    });
  }
});
