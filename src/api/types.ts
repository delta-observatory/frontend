// Fields of the API responses that the frontend reads.
// The backend owns these HTTP responses. Measurement fields follow the result/1 contract
// in database/contracts/result/v1.schema.json.

export interface Page<T> { total: number; limit: number; offset: number; items: T[] }

export interface Dataset {
  id: string;
  state: string;
  last_indexed_at: string | null;
  observation_counts: Record<string, number>;
}

export interface KnownPlanet {
  name: string;
  period_days: number;
  period_err_days: number | null;
  transit_midpoint_btjd_tdb: number;
  transit_midpoint_err_days: number | null;
}

export type TargetClass = "planet_host" | "no_known_planet" | "eclipsing_binary";

export interface Observation {
  id: string;
  dataset_id: string;
  target_id: string;
  sector: number;
  cadence_seconds: number;
  time_start: number;
  time_stop: number;
  time_scale: string;
  time_reference: string;
  row_count: number;
  state: string;
  labels: { class: TargetClass; planets?: KnownPlanet[] | null };
}

export interface ObservationDetail extends Observation {
  header: Record<string, unknown>;
  artifacts: Artifact[];
}

export interface Artifact {
  id: string;
  job_id: string;
  observation_id: string | null;
  kind: string;
  media_type: string;
  content_encoding: string;
  bytes: number;
  sha256: string;
  content_url: string;
}

/** Column artifact, contract columns/1 in database/contracts/artifacts/columns/v1.schema.json. */
export interface ColumnArtifact {
  format: "columns/1";
  length: number;
  description?: string;
  columns: { name: string; unit: string; dtype: "float64" | "int64" | "bool"; time_scale?: string; time_reference?: string; values: (number | boolean | null)[] }[];
}

export interface MethodInfo {
  id: string;
  version: number;
  summary: string;
  scientific_status: string;
  known_deviation?: string;
  scientific_basis: string;
}

export interface RunSummary {
  id: string;
  method_id: string;
  method_version: number;
  label: string | null;
  created_at: string;
  parameters_sha256: string;
  input_count: number;
  job_states: Record<string, number>;
}

export type Uncertainty = { kind: "standard"; value: number } | { kind: "unavailable"; reason: string };

export interface Measurement {
  role: "search" | "reference_comparison";
  name: string;
  value: number;
  unit: string;
  uncertainty: Uncertainty;
  quality_flags: string[];
  time_scale?: string;
  time_reference?: string;
}

export interface JobResult {
  job_id: string;
  observation_id: string;
  state: string;
  outcome: string | null;
  error: unknown;
  measurements: Partial<Record<Measurement["role"], Measurement[]>>;
  artifacts: Artifact[];
  diagnostics: Record<string, unknown> | null;
  software: { python?: string; packages?: Record<string, string>; worker_version?: string } | null;
  resources: { peak_rss_mib?: number; elapsed_seconds?: number } | null;
}

export interface RunResults { run_id: string; jobs: JobResult[] }

export interface Health { status: string; database: string; version: string; contracts: string }
