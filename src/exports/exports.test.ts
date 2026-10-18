import { describe, expect, it } from "vitest";
import { Sha256, sha256Hex } from "./sha256";
import { checkExport, readZip } from "./zip";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sha256", () => {
  it("matches the FIPS 180-4 vectors", () => {
    expect(sha256Hex(enc(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(enc("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
  });
  it("gives the same hash for any chunk split", () => {
    const data = enc("The quick brown fox jumps over the lazy dog. ".repeat(40));
    const whole = sha256Hex(data);
    for (const step of [1, 7, 63, 64, 65, 500]) {
      const h = new Sha256();
      for (let i = 0; i < data.length; i += step) h.update(data.subarray(i, i + step));
      expect(h.hex()).toBe(whole);
    }
  });
});

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** A minimal ZIP writer for the fixture. CRC fields stay 0: the reader checks SHA-256, not CRC. */
async function zip(entries: [string, Uint8Array, boolean][]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data, compress] of entries) {
    const body = compress ? await deflate(data) : data, n = enc(name);
    const local = new Uint8Array(30 + n.length), dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(8, compress ? 8 : 0, true);
    dv.setUint32(18, body.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, n.length, true);
    local.set(n, 30);
    const c = new Uint8Array(46 + n.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, compress ? 8 : 0, true);
    cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, n.length, true); cv.setUint32(42, offset, true);
    c.set(n, 46);
    parts.push(local, body); central.push(c);
    offset += local.length + body.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

const readme = enc("Export of run x.\n"), run = enc(JSON.stringify({ run: { id: "x" } })), art = enc("{\"best\":{}}");
const manifestOf = (over: Partial<Record<string, unknown>> = {}) => ({
  contract: "export/1", subject: { kind: "run", id: "x" }, exported_by: { name: "richard", kind: "person" },
  api: { version: "0.1.0", contracts_source: "c" }, artifacts: "all", withheld: [], protected_excluded: 0, limitations: [],
  files: [
    { path: "README.txt", bytes: readme.length, sha256: sha256Hex(readme), media_type: "text/plain", content: "readme" },
    { path: "run.json", bytes: run.length, sha256: sha256Hex(run), media_type: "application/json", content: "run" },
    { path: "artifacts/a/search.json", bytes: art.length, sha256: sha256Hex(art), media_type: "application/json", content: "artifact", artifact_id: "a", stored_sha256: sha256Hex(art) },
  ],
  ...over,
});

describe("export check", () => {
  it("reads stored and deflated entries", async () => {
    const z = await zip([["a.txt", readme, false], ["b.json", run, true]]);
    expect(readZip(z).map((e) => [e.name, e.method, e.size])).toEqual([["a.txt", 0, readme.length], ["b.json", 8, run.length]]);
  });
  it("passes a complete export and checks the header checksum", async () => {
    const m = enc(JSON.stringify(manifestOf()));
    const z = await zip([["manifest.json", m, true], ["README.txt", readme, true], ["run.json", run, true], ["artifacts/a/search.json", art, false]]);
    const r = await checkExport(z, sha256Hex(m));
    expect(r.ok).toBe(true);
    expect(r.files.every((f) => f.ok)).toBe(true);
    expect((await checkExport(z, "0".repeat(64))).ok).toBe(false);
  });
  it("finds a changed file, a missing file, an unlisted file, and a changed artifact", async () => {
    const m = manifestOf();
    (m.files as { sha256: string; stored_sha256?: string }[])[2]!.stored_sha256 = "f".repeat(64);
    const z = await zip([["manifest.json", enc(JSON.stringify(m)), true], ["README.txt", enc("changed\n"), true], ["artifacts/a/search.json", art, false], ["extra.txt", readme, false]]);
    const r = await checkExport(z, null);
    expect(r.ok).toBe(false);
    expect(r.files.find((f) => f.path === "README.txt")!.problem).toMatch(/size|SHA-256/);
    expect(r.files.find((f) => f.path === "run.json")!.problem).toBe("missing from the ZIP file");
    expect(r.files.find((f) => f.path === "artifacts/a/search.json")!.problem).toMatch(/stored artifact/);
    expect(r.problems.some((p) => p.startsWith("extra.txt"))).toBe(true);
  });
  it("accepts a redacted artifact whose bytes differ from the stored artifact", async () => {
    const m = manifestOf();
    Object.assign((m.files as object[])[2]!, { stored_sha256: "f".repeat(64), redacted: true });
    const z = await zip([["manifest.json", enc(JSON.stringify(m)), false], ["README.txt", readme, false], ["run.json", run, false], ["artifacts/a/search.json", art, false]]);
    expect((await checkExport(z, null)).ok).toBe(true);
  });
});
