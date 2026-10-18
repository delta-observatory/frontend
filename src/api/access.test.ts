import { describe, expect, it } from "vitest";
import { accessOf, canCancel, denied, type Me } from "./access";

const me = (permissions: string[], name = "reviewer"): Me => ({ id: "c1", name, kind: "person", permissions, campaign_id: null });
const run = (requested_by?: string) => ({ requested_by });

describe("accessOf", () => {
  it("gives no write access before GET /me answers", () => {
    const a = accessOf(null);
    expect(a.known).toBe(false);
    expect(a.runs).toBe(false);
    expect(a.records).toBe(false);
  });

  it("gives a read-only client no write access", () => {
    const a = accessOf(me(["read"]));
    expect(a.known).toBe(true);
    expect(a.runs).toBe(false);
    expect(a.records).toBe(false);
    expect(a.admin).toBe(false);
  });

  it("follows run.submit and record.write separately", () => {
    expect(accessOf(me(["read", "run.submit"]))).toMatchObject({ runs: true, records: false });
    expect(accessOf(me(["read", "record.write"]))).toMatchObject({ runs: false, records: true });
  });

  it("treats a missing permission list as read-only", () => {
    expect(accessOf({ id: "c1", name: "x", kind: "person" } as Me)).toMatchObject({ known: true, runs: false, records: false });
  });
});

describe("denied", () => {
  it("is null for an allowed action", () => {
    expect(denied(accessOf(me(["read", "run.submit"])), "runs")).toBeNull();
    expect(denied(accessOf(me(["read", "record.write"])), "records")).toBeNull();
  });

  it("names the missing permission for a read-only client", () => {
    expect(denied(accessOf(me(["read"])), "runs")).toContain("run.submit");
    expect(denied(accessOf(me(["read"])), "records")).toContain("record.write");
  });

  it("explains the wait before GET /me answers", () => {
    expect(denied(accessOf(null), "runs")).toMatch(/checking/i);
  });
});

describe("canCancel", () => {
  it("lets run.submit cancel only the client's own runs", () => {
    const a = accessOf(me(["read", "run.submit"], "richard"));
    expect(canCancel(a, run("client:richard"))).toBe(true);
    expect(canCancel(a, run("client:other"))).toBe(false);
    expect(canCancel(a, run(undefined))).toBe(false);
  });

  it("lets admin cancel any run", () => {
    expect(canCancel(accessOf(me(["read", "admin"])), run("client:other"))).toBe(true);
  });

  it("refuses a read-only client", () => {
    expect(canCancel(accessOf(me(["read"], "richard")), run("client:richard"))).toBe(false);
  });
});
