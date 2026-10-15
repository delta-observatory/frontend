import { describe, expect, it } from "vitest";
import type { ParamSchema } from "../api/types";
import { check, failedConstraints, fields, parse, setAt } from "./params";

const schema: ParamSchema = {
  type: "object",
  properties: {
    flux_column: { enum: ["pdcsap_flux", "sap_flux"] },
    flatten: { type: "object", description: "Trend removal.", properties: { window_length: { type: "integer", minimum: 11, maximum: 20001, not: { multipleOf: 2 }, "x-unit": "cadence" } } },
    search: {
      type: "object",
      properties: {
        minimum_period: { type: "number", exclusiveMinimum: 0, maximum: 100 },
        maximum_period: { type: "number", exclusiveMinimum: 0, maximum: 100 },
        duration_days: { type: "array", minItems: 1, uniqueItems: true, items: { type: "number", exclusiveMinimum: 0, maximum: 2 } },
      },
    },
  },
};

describe("parameter form logic", () => {
  it("lists leaf fields with their groups", () => {
    expect(fields(schema).map((f) => `${f.group ?? "-"}:${f.key}`)).toEqual(["-:flux_column", "flatten:flatten.window_length", "search:search.minimum_period", "search:search.maximum_period", "search:search.duration_days"]);
  });

  it("parses text into the schema type", () => {
    expect(parse("1001", { type: "integer" })).toEqual({ value: 1001 });
    expect(parse("10.5", { type: "integer" })).toHaveProperty("error");
    expect(parse("0.04, 0.06 0.1", { type: "array", items: { type: "number" } })).toEqual({ value: [0.04, 0.06, 0.1] });
    expect(parse("sap_flux", { enum: ["pdcsap_flux", "sap_flux"] })).toEqual({ value: "sap_flux" });
    expect(parse("flux", { enum: ["pdcsap_flux", "sap_flux"] })).toHaveProperty("error");
  });

  it("checks ranges, odd values, and array rules", () => {
    const wl = fields(schema)[1]!.schema;
    expect(check(1000, wl)).toEqual(["must be odd"]);
    expect(check(5, wl)).toEqual(["≥ 11"]);
    expect(check(1001, wl)).toEqual([]);
    const dur = fields(schema)[4]!.schema;
    expect(check([0.1, 0.1], dur)).toEqual(["values must be different"]);
    expect(check([3], dur)).toEqual(["each ≤ 2"]);
  });

  it("evaluates the cross-field rules", () => {
    const p = setAt(setAt(setAt({}, ["search", "minimum_period"], 5), ["search", "maximum_period"], 2), ["search", "duration_days"], [0.1, 6]);
    const failed = failedConstraints(["search.minimum_period < search.maximum_period", "max(search.duration_days) < search.minimum_period"], p);
    expect(failed.map((f) => f.rule)).toHaveLength(2);
    expect(failed[1]!.paths).toEqual(["search.duration_days", "search.minimum_period"]);
  });

  it("accepts number literals in rules", () => {
    expect(failedConstraints(["min(a.list) > 0"], { a: { list: [0, 2] } })).toEqual([{ rule: "min(a.list) > 0", paths: ["a.list"] }]);
  });
});
