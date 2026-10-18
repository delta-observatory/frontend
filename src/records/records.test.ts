import { describe, expect, it } from "vitest";
import type { Candidate, CompareRow } from "../api/records";
import { category, filterRows, formatDelta, formatValue, paramText, sortByAbsDelta } from "../compare/compare";
import { campaignStage, chipClass, citable, clock, filterCandidates, history, leaseLeft, NO_FILTER, refLabel } from "./view";

const actor = (name: string, kind: "person" | "agent" | "service" = "person") => ({ id: name, name, kind });

describe("record vocabulary", () => {
  it("gives each status its border style", () => {
    expect(chipClass(null)).toBe("chip open");
    expect(chipClass("unreviewed")).toBe("chip open");
    expect(chipClass("unchecked")).toBe("chip open");
    expect(chipClass("ambiguous")).toBe("chip amb");
    expect(chipClass("rejected")).toBe("chip rej");
    expect(chipClass("supported")).toBe("chip");
    expect(chipClass("unmatched")).toBe("chip");
  });
  it("names references", () => {
    expect(refLabel({ kind: "measurement", id: 4417 })).toBe("m 4417");
    expect(refLabel({ kind: "job", id: "344f44fc-137f-4329-97f4-44a3bbfa6a7c" })).toBe("job 344f44fc");
    expect(refLabel({ kind: "external", uri: "research:delta-research/FINAL001/TIC-1.md", sha256: "0", bytes: 1 })).toBe("↗ TIC-1.md");
    expect(refLabel({ kind: "external", uri: null, sha256: "0", bytes: 1 })).toBe("↗ withheld");
  });
  it("cites platform references and visible external files, without the resolved record", () => {
    expect(citable([{ kind: "external", uri: "u", sha256: "0", bytes: 1 }, { kind: "external", uri: null, sha256: "1", bytes: 1 },
      { kind: "artifact", id: "a", sha256: "s", record: { id: "a" } }, { kind: "measurement", id: 3 }]))
      .toEqual([{ kind: "external", uri: "u", sha256: "0", bytes: 1 }, { kind: "artifact", id: "a", sha256: "s" }, { kind: "measurement", id: 3 }]);
  });
  it("orders the history newest first across record types", () => {
    const base = { candidate_id: "c", campaign_id: null, evidence: [], import_key: null, text_withheld: false };
    const h = history({
      assessments: [{ ...base, id: "a1", axis: "evidence", status: "supported", basis: "review", method: null, decision_id: null, reason: "r", quality_flags: [], supersedes: null, actor: actor("richard"), created_at: "2026-10-18T14:01:00Z" }],
      decisions: [],
      notes: [{ id: "n1", campaign_id: null, body: "b", subjects: [], import_key: null, text_withheld: false, actor: actor("agent-a", "agent"), created_at: "2026-10-18T14:05:00Z" }],
    });
    expect(h.map((x) => x.type)).toEqual(["note", "assessment"]);
  });
  it("gives the lease time and the campaign stage", () => {
    const now = Date.parse("2026-10-18T12:00:00Z");
    expect(leaseLeft({ state: "claimed", lease_expires_at: "2026-10-18T12:11:32Z" }, now)).toBe(692);
    expect(leaseLeft({ state: "queued", lease_expires_at: null }, now)).toBeNull();
    expect(clock(692)).toBe("11:32");
    expect(campaignStage({ approved_at: "x", decisions_fixed_at: null, revealed_at: null, closed_at: null })).toBe(1);
    expect(campaignStage({ approved_at: "x", decisions_fixed_at: "x", revealed_at: "x", closed_at: "x" })).toBe(4);
  });
  it("filters candidates by axis status, tier, writer, and text", () => {
    const c = (id: string, over: Partial<Candidate>): Candidate => ({
      id, campaign_id: null, label: id, kind: "transit_signal", tier: "platform", summary: "box", observation_ids: [], evidence: [], import_key: null,
      text_withheld: false, status_rule: "candidate-status/1", evidence_status: null, identity_status: null, actor: actor("richard"), created_at: "", withheld: [], ...over,
    });
    const list = [
      c("D001", { evidence_status: { status: "supported", assessment_id: "a", basis: "review" } }),
      c("D002", { tier: "lab", actor: actor("research-import", "service") }),
    ];
    expect(filterCandidates(list, { ...NO_FILTER, evidence: "unreviewed" }).map((x) => x.id)).toEqual(["D002"]);
    expect(filterCandidates(list, { ...NO_FILTER, tier: "platform" }).map((x) => x.id)).toEqual(["D001"]);
    expect(filterCandidates(list, { ...NO_FILTER, writer: "research-import" }).map((x) => x.id)).toEqual(["D002"]);
    expect(filterCandidates(list, { ...NO_FILTER, text: "d001" }).map((x) => x.id)).toEqual(["D001"]);
    expect(filterCandidates(list, { ...NO_FILTER, campaign: "none" })).toHaveLength(2);
  });
});

describe("run comparison display", () => {
  const m = (value: number) => ({ id: 1, role: "search" as const, name: "period", value, unit: "d", uncertainty: { kind: "unavailable" as const, reason: "grid" }, quality_flags: [] });
  const side = (value: number, state = "complete") => ({ job_id: "j", state, outcome: "complete", error: null, measurements: { search: { period: m(value) } } });
  const d = (value: number) => ({ search: { period: { value, unit: "d", display_calculation: true as const, rule: "run-comparison/1", uncertainty: { kind: "unavailable" as const, reason: "correlated" } } } });
  const rows: CompareRow[] = [
    { observation_id: "1", target_id: "TIC:1", sector: 1, a: side(1), b: side(1.5), differences: d(0.5) },
    { observation_id: "2", target_id: "TIC:2", sector: 1, a: side(2), b: null, differences: {} },
    { observation_id: "3", target_id: "TIC:3", sector: 1, a: side(3), b: side(2, "failed"), differences: d(-1) },
    { observation_id: "4", target_id: "TIC:4", sector: 1, a: null, b: side(4), differences: {} },
  ];
  it("filters by presence and state", () => {
    expect(rows.map(category)).toEqual(["both", "only_a", "both", "only_b"]);
    expect(filterRows(rows, "both").map((r) => r.observation_id)).toEqual(["1", "3"]);
    expect(filterRows(rows, "only_a").map((r) => r.observation_id)).toEqual(["2"]);
    expect(filterRows(rows, "state_differs").map((r) => r.observation_id)).toEqual(["3"]);
  });
  it("sorts by |Δ| and keeps rows without a difference last", () => {
    expect(sortByAbsDelta(rows, "period").map((r) => r.observation_id)).toEqual(["3", "1", "2", "4"]);
  });
  it("formats differences, values, and parameters", () => {
    expect(formatDelta(0)).toBe("0");
    expect(formatDelta(0.5)).toBe("+0.5");
    expect(formatDelta(-1.25e-6)).toBe("−1.25e-6");
    expect(formatValue(0.9413849094310086)).toBe("0.9413849");
    expect(formatValue(null)).toBe("—");
    expect(formatValue(28)).toBe("28");
    expect(paramText([0.04, 0.06, 0.08, 0.1, 0.12, 0.16, 0.2])).toBe("0.04 … 0.2 (7)");
    expect(paramText(undefined)).toBe("absent");
  });
});
