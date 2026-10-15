import { describe, expect, it } from "vitest";
import type { Target } from "./catalogue";
import { parseSearch } from "./search";

const t = (over: Partial<Target>): Target => ({
  id: "x", tic: "TIC:1", sector: 2, cls: "planet_host", name: null, refPeriod: null, ra: 0, dec: 0, v: [1, 0, 0],
  tmag: 9, period: 1, depth: 0.01, snr: 50, relErr: null, status: null, jobState: null, cadence: 120, ...over,
});

describe("parseSearch", () => {
  const wasp = t({ name: "WASP-18 b", tic: "TIC:100100827", snr: 652, relErr: 7e-5, refPeriod: 0.94 });
  const quiet = t({ cls: "no_known_planet", tic: "TIC:24703650", snr: 5 });

  it("matches text in the name and the TIC identifier", () => {
    expect(parseSearch("wasp").test(wasp)).toBe(true);
    expect(parseSearch("24703650").test(quiet)).toBe(true);
    expect(parseSearch("wasp").test(quiet)).toBe(false);
  });

  it("compares numeric fields", () => {
    expect(parseSearch("snr>100").test(wasp)).toBe(true);
    expect(parseSearch("snr>100").test(quiet)).toBe(false);
    expect(parseSearch("sector:2 snr<10").test(quiet)).toBe(true);
  });

  it("does not match a comparison on a missing value", () => {
    expect(parseSearch("err<0.01").test(quiet)).toBe(false);
    expect(parseSearch("err<0.01").test(wasp)).toBe(true);
  });

  it("applies the class filter", () => {
    expect(parseSearch("", "no_known_planet").test(quiet)).toBe(true);
    expect(parseSearch("", "no_known_planet").test(wasp)).toBe(false);
  });

  it("reports unknown fields and missing numbers, and ignores those tokens", () => {
    const s = parseSearch("depthx>2 snr> wasp");
    expect(s.errors).toHaveLength(2);
    expect(s.test(wasp)).toBe(true);
  });
});
