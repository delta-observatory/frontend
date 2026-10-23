import { describe, expect, it } from "vitest";
import { entries, safeUrl, type Catalog } from "./catalog";

describe("dataset views", () => {
  it("keeps index availability separate from descriptions and explicit experiment roles", () => {
    const catalog = { datasets: { available: true, issues: [], items: [{ id: "reference", name: "Reference" }, { id: "images" }] }, experiments: { available: true, issues: [], items: [{ id: "trial", datasets: [{ dataset_id: "images", role: "inputs" }, { dataset_id: "reference", role: "reference" }, { dataset_id: "images", role: "second" }] }] } } as unknown as Catalog;
    const list = entries(catalog, [{ id: "indexed-only", state: "ready", last_indexed_at: null, observation_counts: { ready: 8 } }]);
    expect(list.map((e) => e.id)).toEqual(["indexed-only", "images", "reference"]);
    expect(list[0]?.description).toBeUndefined();
    expect(list[0]?.experiments).toEqual([]);
    expect(list[1]?.indexed).toBeUndefined();
    expect(list[1]?.experiments).toHaveLength(1);
    expect(list[2]?.experiments).toHaveLength(1);
  });
  it("retains indexed observations when documentation is unavailable", () => {
    expect(entries(null, [{ id: "one", state: "ready", last_indexed_at: null, observation_counts: {} }])[0]?.id).toBe("one");
  });
  it("permits only HTTP source links", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("data:text/html,test")).toBeUndefined();
    expect(safeUrl("https://example.org/data")).toBe("https://example.org/data");
  });
});
