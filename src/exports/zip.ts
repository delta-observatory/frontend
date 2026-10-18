// Reads an evidence export (a ZIP file) and checks every file against manifest.json, contract export/1.
// The check repeats backend/scripts/verify_export.py in the browser: size and SHA-256 of each listed file,
// unlisted files, unsafe paths, and stored_sha256 against sha256 for an artifact that blinding did not redact.
import { sha256Hex, Sha256 } from "./sha256";

export interface ZipEntry { name: string; method: number; compressedSize: number; size: number; dataStart: number }

export interface ManifestFile {
  path: string; bytes: number; sha256: string; media_type: string; content: string;
  artifact_id?: string; stored_sha256?: string; redacted?: boolean;
}
export interface Manifest {
  contract: "export/1";
  subject: { kind: string; id: string };
  exported_by: { name: string; kind: string };
  api: { version: string; contracts_source: string };
  artifacts: "none" | "all";
  withheld: string[];
  protected_excluded: number;
  files: ManifestFile[];
  limitations: string[];
}

export interface FileCheck { path: string; ok: boolean; problem: string | null }
export interface ExportCheck {
  ok: boolean;
  manifestSha256: string;
  manifest: Manifest | null;
  files: FileCheck[];
  problems: string[];
}

/** The entries of a ZIP file, from its central directory. ZIP64 is not supported: exports stay below 4 GiB. */
export function readZip(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("The file is not a ZIP file: no end of central directory.");
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const decoder = new TextDecoder(), out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("The ZIP central directory is damaged.");
    const method = dv.getUint16(p + 10, true), compressedSize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true), name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (dv.getUint32(local, true) !== 0x04034b50) throw new Error(`The local header of ${name} is damaged.`);
    const dataStart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    out.push({ name, method, compressedSize, size, dataStart });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The bytes of one entry. Method 0 is stored, method 8 is deflate. */
export async function entryBytes(buf: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const raw = buf.subarray(e.dataStart, e.dataStart + e.compressedSize);
  if (e.method === 0) return raw;
  if (e.method !== 8) throw new Error(`${e.name}: compression method ${e.method} is not supported.`);
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** SHA-256 of large data in slices, with a pause between slices so the page stays responsive. */
async function hashLarge(data: Uint8Array): Promise<string> {
  const h = new Sha256(), step = 4 << 20;
  for (let i = 0; i < data.length; i += step) {
    h.update(data.subarray(i, i + step));
    if (i + step < data.length) await new Promise((r) => setTimeout(r, 0));
  }
  return h.hex();
}

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** Checks an export. headerSha256 is the X-Export-Manifest-SHA256 response header, when the download gave one. */
export async function checkExport(buf: Uint8Array, headerSha256: string | null, progress?: (done: number, total: number) => void): Promise<ExportCheck> {
  const problems: string[] = [], files: FileCheck[] = [];
  const entries = readZip(buf), byName = new Map(entries.map((e) => [e.name, e]));
  const m = byName.get("manifest.json");
  if (!m) return { ok: false, manifestSha256: "", manifest: null, files, problems: ["The export has no manifest.json."] };
  const manifestBytes = await entryBytes(buf, m), manifestSha256 = sha256Hex(manifestBytes);
  if (headerSha256 && headerSha256 !== manifestSha256) problems.push(`manifest.json SHA-256 ${manifestSha256} differs from the response header ${headerSha256}.`);
  let manifest: Manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest; } catch { return { ok: false, manifestSha256, manifest: null, files, problems: ["manifest.json is not valid JSON."] }; }
  if (manifest.contract !== "export/1") problems.push(`The manifest contract is ${String(manifest.contract)}, not export/1.`);
  const listed = new Set<string>();
  let done = 0;
  for (const f of manifest.files ?? []) {
    listed.add(f.path);
    let problem: string | null = null;
    const e = byName.get(f.path);
    if (!SAFE.test(f.path) || f.path.includes("..")) problem = "unsafe path";
    else if (!e) problem = "missing from the ZIP file";
    else {
      const data = await entryBytes(buf, e), sha = data.length > 8 << 20 ? await hashLarge(data) : sha256Hex(data);
      if (data.length !== f.bytes) problem = `size ${data.length} B, manifest ${f.bytes} B`;
      else if (sha !== f.sha256) problem = `SHA-256 ${sha.slice(0, 12)}…, manifest ${f.sha256.slice(0, 12)}…`;
      else if (f.content === "artifact" && !f.redacted && f.stored_sha256 !== f.sha256) problem = "artifact bytes differ from the stored artifact";
    }
    files.push({ path: f.path, ok: problem == null, problem });
    progress?.(++done, manifest.files.length);
  }
  for (const e of entries) if (e.name !== "manifest.json" && !listed.has(e.name)) problems.push(`${e.name} is in the ZIP file but not in the manifest.`);
  return { ok: problems.length === 0 && files.every((f) => f.ok), manifestSha256, manifest, files, problems };
}
