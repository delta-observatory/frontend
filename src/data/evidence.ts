import { getJson } from "../api/client";
import type { Artifact, ColumnArtifact, JobResult, KnownPlanet, ObservationDetail } from "../api/types";
import type { Catalogue } from "./catalogue";

/** Float64 columns of a columns/1 artifact. Null values become NaN. */
export type Columns = Record<string, Float64Array>;
export interface ColumnMeta { unit: string; time_scale?: string; time_reference?: string }

export interface SearchBest { period: number; power: number; depth: number; depth_err: number; duration: number; transit_time: number; depth_snr: number }
export interface SearchSummary {
  best: SearchBest;
  peaks: SearchBest[];
  grid_trials: number;
  grid_period_min_days: number;
  grid_period_max_days: number;
}
export interface InputChecks {
  rows: number;
  retained: number;
  excluded: number;
  exclusion_reasons_overlapping: Record<string, number>;
  quality_values: Record<string, number>;
  flux_column: string;
  baseline_days: number;
  time_min: number;
  time_max: number;
  crowdsap?: number;
  flfrcsap?: number;
  procver?: string;
}

/** Everything the workbench and the inspector show for one observation in one run. */
export interface Evidence {
  observation: ObservationDetail;
  job: JobResult;
  planet: KnownPlanet | null;
  lightCurve: Columns;
  lightCurveMeta: Record<string, ColumnMeta>;
  prepared: Columns;
  periodogram: Columns;
  summary: SearchSummary;
  checks: InputChecks;
  /** Light-curve rows that the preparation did not keep, with their QUALITY values. */
  excluded: { time: Float64Array; quality: Float64Array };
  timing: { fetchMs: number; parseMs: number; bytes: number };
}

function toColumns(a: ColumnArtifact): { cols: Columns; meta: Record<string, ColumnMeta> } {
  const cols: Columns = {}, meta: Record<string, ColumnMeta> = {};
  for (const c of a.columns) {
    const out = new Float64Array(c.values.length);
    for (let i = 0; i < c.values.length; i++) { const v = c.values[i]; out[i] = v == null ? NaN : Number(v); }
    cols[c.name] = out;
    meta[c.name] = { unit: c.unit, time_scale: c.time_scale, time_reference: c.time_reference };
  }
  return { cols, meta };
}

async function fetchArtifact<T>(a: Artifact | undefined, kind: string, timing: Evidence["timing"]): Promise<T> {
  if (!a) throw new Error(`The result has no ${kind} artifact.`);
  const t0 = performance.now();
  const res = await fetch(a.content_url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: GET ${a.content_url}`);
  const text = await res.text();
  const t1 = performance.now();
  const value = JSON.parse(text) as T;
  timing.fetchMs = Math.max(timing.fetchMs, t1 - t0);
  timing.parseMs += performance.now() - t1;
  timing.bytes += a.bytes;
  return value;
}

const cache = new Map<string, Evidence>();
const inFlight = new Map<string, Promise<Evidence>>();
const CACHE_SIZE = 12;

/**
 * Loads the artifacts of one observation's job in the active run. Keeps the 12 most recent in memory.
 * The cache key is the job, because the same observation has a different job in each run.
 */
export function loadEvidence(observationId: string, catalogue: Catalogue): Promise<Evidence> {
  const key = catalogue.jobs.get(observationId)?.job_id ?? `none:${observationId}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit); }
  const running = inFlight.get(key);
  if (running) return running;
  const p = load(observationId, catalogue).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  p.then((ev) => {
    cache.set(key, ev);
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }, () => {});
  return p;
}

/** Starts a load and ignores its result. A later selection uses the cached result. */
export function prefetchEvidence(observationId: string, catalogue: Catalogue) {
  loadEvidence(observationId, catalogue).catch(() => { /* The selection shows the error if it happens again. */ });
}

async function load(observationId: string, catalogue: Catalogue): Promise<Evidence> {
  const observation = catalogue.observations.get(observationId) ?? await getJson<ObservationDetail>(`/observations/${observationId}`);
  const job = catalogue.jobs.get(observationId);
  if (!job) throw new Error("The active run has no job for this observation.");
  if (job.outcome !== "complete") throw new Error(`The job outcome is "${job.outcome ?? job.state}". It has no search artifacts.${job.error ? ` Error: ${typeof job.error === "string" ? job.error : JSON.stringify(job.error)}` : ""}`);
  const timing = { fetchMs: 0, parseMs: 0, bytes: 0 };
  const art = (kind: string) => job.artifacts.find((a) => a.kind === kind);
  const [lc, prep, pg, summary, checks] = await Promise.all([
    fetchArtifact<ColumnArtifact>(observation.artifacts.find((a) => a.kind === "light_curve"), "light_curve", timing),
    fetchArtifact<ColumnArtifact>(art("prepared_series"), "prepared_series", timing),
    fetchArtifact<ColumnArtifact>(art("periodogram"), "periodogram", timing),
    fetchArtifact<SearchSummary>(art("search_summary"), "search_summary", timing),
    fetchArtifact<InputChecks>(art("input_checks"), "input_checks", timing),
  ]);
  const t = performance.now();
  const light = toColumns(lc), prepared = toColumns(prep).cols, periodogram = toColumns(pg).cols;
  const kept = new Uint8Array(light.cols.time!.length);
  for (const r of prepared.source_row ?? []) kept[r] = 1;
  const exT: number[] = [], exQ: number[] = [];
  for (let i = 0; i < kept.length; i++) if (!kept[i] && Number.isFinite(light.cols.time![i]!)) { exT.push(light.cols.time![i]!); exQ.push(light.cols.quality?.[i] ?? NaN); }
  timing.parseMs += performance.now() - t;
  const evidence: Evidence = {
    observation, job, planet: observation.labels.planets?.[0] ?? null,
    lightCurve: light.cols, lightCurveMeta: light.meta, prepared, periodogram, summary, checks,
    excluded: { time: Float64Array.from(exT), quality: Float64Array.from(exQ) }, timing,
  };
  return evidence;
}
