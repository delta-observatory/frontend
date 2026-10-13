import { getJson, pool } from "../api/client";
import type { Dataset, Health, Observation, ObservationDetail, Page, RunResults, RunSummary, TargetClass } from "../api/types";
import { eqToVec, type Vec3 } from "../sky/math";

/** One observation with its sky position and its result in the selected run. */
export interface Target {
  id: string;
  tic: string;
  sector: number;
  cls: TargetClass;
  name: string | null;
  refPeriod: number | null;
  ra: number | null;
  dec: number | null;
  v: Vec3 | null;
  tmag: number | null;
  period: number | null;
  depth: number | null;
  snr: number | null;
  relErr: number | null;
}

export interface Catalogue {
  health: Health;
  dataset: Dataset | null;
  run: RunSummary | null;
  targets: Target[];
  loadMs: number;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

async function allObservations(): Promise<Observation[]> {
  const out: Observation[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await getJson<Page<Observation>>(`/observations?limit=200&offset=${offset}`);
    out.push(...page.items);
    if (out.length >= page.total || page.items.length === 0) return out;
  }
}

export async function loadCatalogue(): Promise<Catalogue> {
  const t0 = performance.now();
  const [health, datasets, observations, runs] = await Promise.all([
    getJson<Health>("/health"),
    getJson<Dataset[]>("/datasets"),
    allObservations(),
    getJson<RunSummary[]>("/runs"),
  ]);
  // The list response has no sky position. Each detail response has RA_OBJ and DEC_OBJ in its header.
  const run = runs.find((r) => r.method_id === "tess-bls" && (r.job_states.complete ?? 0) > 0) ?? null;
  const [details, results] = await Promise.all([
    pool(observations, 8, (o) => getJson<ObservationDetail>(`/observations/${o.id}`)),
    run ? getJson<RunResults>(`/runs/${run.id}/results`) : Promise.resolve<RunResults | null>(null),
  ]);
  const byObservation = new Map(results?.jobs.map((j) => [j.observation_id, j]));
  const targets = details.map((d): Target => {
    const ra = num(d.header.RA_OBJ), dec = num(d.header.DEC_OBJ), planet = d.labels.planets?.[0] ?? null;
    const job = byObservation.get(d.id);
    const m = (role: "search" | "reference_comparison", name: string) => job?.measurements[role]?.find((x) => x.name === name)?.value ?? null;
    return {
      id: d.id, tic: d.target_id, sector: d.sector, cls: d.labels.class, name: planet?.name ?? null, refPeriod: planet?.period_days ?? null,
      ra, dec, v: ra != null && dec != null ? eqToVec(ra, dec) : null, tmag: num(d.header.TESSMAG),
      period: m("search", "period"), depth: m("search", "depth"), snr: m("search", "depth_snr"), relErr: m("reference_comparison", "relative_period_error"),
    };
  });
  return { health, dataset: datasets.find((d) => d.id === observations[0]?.dataset_id) ?? datasets[0] ?? null, run, targets, loadMs: performance.now() - t0 };
}

/** Display bins for the marker colour. They are not a validation criterion. */
export type DisplayStatus = "match" | "near" | "miss" | "signal" | "eb" | "quiet";
export function displayStatus(t: Target): DisplayStatus {
  if (t.cls === "eclipsing_binary") return "eb";
  if (t.cls === "no_known_planet") return (t.snr ?? 0) > 100 ? "signal" : "quiet";
  if (t.relErr == null) return "quiet";
  return t.relErr < 0.01 ? "match" : t.relErr < 0.05 ? "near" : "miss";
}
