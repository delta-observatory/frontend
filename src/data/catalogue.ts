import { ApiError, getJson } from "../api/client";
import type { Dataset, Health, JobResult, MethodInfo, ObservationDetail, RunResults, RunSummary, TargetClass } from "../api/types";
import { eqToVec, type Vec3 } from "../sky/math";

/** Display status from the API rule period-agreement/1. It is not a validation criterion. */
export type DisplayStatus = "match" | "near" | "miss" | "signal" | "eb" | "quiet";

/** One observation with its sky position and its values in the active run, from GET /api/targets. */
export interface Target {
  id: string;
  tic: string;
  sector: number;
  cls: TargetClass | null;
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
  /** Null when the API withholds labels. The display then uses "quiet". */
  status: DisplayStatus | null;
  jobState: string | null;
  cadence: number | null;
}

/** Data that does not depend on the active run. */
export interface Base {
  health: Health;
  dataset: Dataset | null;
  datasets: Dataset[];
  methods: Map<string, MethodInfo>;
  loadMs: number;
}

export async function loadBase(): Promise<Base> {
  const t0 = performance.now();
  const [health, datasets, methodList] = await Promise.all([getJson<Health>("/health"), getJson<Dataset[]>("/datasets"), getJson<MethodInfo[]>("/methods")]);
  let remembered: string | null = null;
  try { remembered = localStorage.getItem("delta.dataset"); } catch { /* Use the API default. */ }
  return {
    health,
    datasets,
    dataset: datasets.find((d) => d.id === remembered) ?? datasets.find((d) => (d.observation_counts.ready ?? 0) > 0) ?? datasets[0] ?? null,
    methods: new Map(methodList.map((m) => [`${m.id}/${m.version}`, m])),
    loadMs: performance.now() - t0,
  };
}

interface TargetRow {
  observation_id: string; target_id: string; sector: number; ra_deg: number | null; dec_deg: number | null; tmag: number | null;
  label_class: TargetClass | null; planet_name: string | null; reference_period_days: number | null; job_state: string | null;
  period_days: number | null; depth: number | null; depth_snr: number | null; relative_period_error: number | null; status: DisplayStatus | null;
  cadence_seconds: number | null;
}
interface TargetPage { total: number; items: TargetRow[]; status_rule: string }

/** All ready observations of a dataset with the values of one run, in pages of 5000. The API sorts by depth S/N. */
export async function loadTargets(runId: string | null, datasetId: string | null): Promise<{ targets: Target[]; statusRule: string; loadMs: number }> {
  const t0 = performance.now(), targets: Target[] = [];
  let statusRule = "";
  for (let offset = 0; ; offset += 5000) {
    const params = new URLSearchParams({ limit: "5000", offset: String(offset) });
    if (runId) params.set("run_id", runId);
    if (datasetId) params.set("dataset_id", datasetId);
    const page = await getJson<TargetPage>(`/targets?${params}`);
    statusRule = page.status_rule;
    for (const r of page.items) {
      targets.push({
        id: r.observation_id, tic: r.target_id, sector: r.sector, cls: r.label_class, name: r.planet_name, refPeriod: r.reference_period_days,
        ra: r.ra_deg, dec: r.dec_deg, v: r.ra_deg != null && r.dec_deg != null ? eqToVec(r.ra_deg, r.dec_deg) : null, tmag: r.tmag,
        period: r.period_days, depth: r.depth, snr: r.depth_snr, relErr: r.relative_period_error, status: r.status, jobState: r.job_state,
        cadence: r.cadence_seconds,
      });
    }
    if (targets.length >= page.total || page.items.length === 0) return { targets, statusRule, loadMs: performance.now() - t0 };
  }
}

/** The run that the API rule default-run/1 selects, or null when no analysis run has a complete job. */
export async function loadDefaultRun(datasetId: string | null): Promise<RunSummary | null> {
  try {
    return (await getJson<{ run: RunSummary }>(`/runs/default${datasetId ? `?dataset_id=${encodeURIComponent(datasetId)}` : ""}`)).run;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** The colour bin of a target. A target without a status (labels withheld) shows as quiet. */
export const statusOf = (t: Target): DisplayStatus => t.status ?? "quiet";

// Details for one target, on demand. Observation records and finished job results do not change, so they stay cached.
const observations = new Map<string, Promise<ObservationDetail>>();
export function getObservation(id: string): Promise<ObservationDetail> {
  let p = observations.get(id);
  if (!p) { p = getJson<ObservationDetail>(`/observations/${id}`); observations.set(id, p); p.catch(() => observations.delete(id)); }
  return p;
}

const results = new Map<string, Promise<JobResult | null>>();
export function getJobResult(runId: string, observationId: string): Promise<JobResult | null> {
  const key = `${runId}:${observationId}`;
  let p = results.get(key);
  if (!p) {
    p = getJson<RunResults>(`/runs/${runId}/results?observation_id=${observationId}`).then((r) => r.jobs[0] ?? null);
    results.set(key, p);
    // A job that is not finished can change. Load it again next time.
    p.then((j) => { if (!j || j.state === "queued" || j.state === "running") results.delete(key); }, () => results.delete(key));
  }
  return p;
}
