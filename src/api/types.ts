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

/** The subset of JSON Schema (draft 2020-12) that method parameter schemas use. */
export interface ParamSchema {
  type?: "object" | "integer" | "number" | "array" | "string" | "boolean";
  description?: string;
  properties?: Record<string, ParamSchema>;
  required?: string[];
  enum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  not?: { multipleOf?: number };
  items?: ParamSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  "x-unit"?: string;
}

export interface MethodInfo {
  id: string;
  version: number;
  kind: string;
  summary: string;
  title: string;
  description: string;
  scientific_status: string;
  known_deviation?: string;
  scientific_basis: string;
  parameters_schema: ParamSchema;
  defaults: Record<string, unknown>;
  constraints: string[];
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

export type JobState = "queued" | "running" | "complete" | "inconclusive" | "failed" | "cancelled";

export interface JobRow {
  id: string;
  observation_id: string;
  state: JobState;
  attempts: number;
  max_attempts: number;
  claimed_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  outcome: string | null;
  error: unknown;
}

export interface RunDetail extends Omit<RunSummary, "input_count" | "job_states"> {
  parameters: Record<string, unknown>;
  requested_by: string;
  inputs: string[];
  jobs: JobRow[];
}

export interface RunRequest {
  method: { id: string; version: number };
  parameters: Record<string, unknown>;
  observation_ids: string[];
  label?: string;
}

/** POST /api/runs/estimate: the checked parameters and the work estimate (rule bls-grid/1). */
export interface RunEstimate {
  method: { id: string; version: number };
  parameters: Record<string, unknown>;
  observation_count: number;
  estimate_reason: string | null;
  estimate: {
    rule: string;
    trials: { min: number; max: number; total: number } | null;
    limit: number;
    over_limit: number;
    seconds_per_trial: { median: number; jobs: number; source: string } | null;
    worker_seconds: number | null;
    items: { observation_id: string; baseline_days: number | null; trials: number | null; over_limit: boolean }[];
  } | null;
}

/** A 422 response: one entry for each error. loc is the path in the request body. */
export interface ValidationErrorBody { detail: { loc: (string | number)[]; msg: string }[] | string }

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
