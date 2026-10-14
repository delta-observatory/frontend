// Convert d3-celestial star and constellation files into compact sky assets.
// Usage: node scripts/build-sky-data.mjs <directory with stars.8.json and constellations.lines.json>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("Give the directory that contains the d3-celestial data files.");
const read = (name) => { const raw = readFileSync(join(dir, name)); return { json: JSON.parse(raw), sha256: createHash("sha256").update(raw).digest("hex") }; };
const r = (x, n) => Number(x.toFixed(n));

const stars = read("stars.8.json");
const out = { ra: [], dec: [], mag: [], bv: [] };
for (const f of stars.json.features) {
  const [lon, lat] = f.geometry.coordinates;
  out.ra.push(r(((lon % 360) + 360) % 360, 4)); out.dec.push(r(lat, 4));
  out.mag.push(Number(f.properties.mag)); out.bv.push(f.properties.bv === "" || f.properties.bv == null ? null : Number(f.properties.bv));
}
writeFileSync("public/sky/stars.json", JSON.stringify(out));

const cons = read("constellations.lines.json");
const lines = [];
for (const f of cons.json.features) for (const line of f.geometry.coordinates) lines.push({ id: f.id, points: line.flatMap(([lon, lat]) => [r(((lon % 360) + 360) % 360, 3), r(lat, 3)]) });
writeFileSync("public/sky/constellations.json", JSON.stringify({ lines }));

console.log(`stars ${out.ra.length} sha256 ${stars.sha256}`);
console.log(`constellation lines ${lines.length} sha256 ${cons.sha256}`);
