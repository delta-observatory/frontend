// Research records, campaigns, run comparison, and the write helpers.
// The backend owns these responses. Record documents follow database/contracts/records/.
import { apiFetch, getJson } from "./client";
import type { Measurement, RunSummary, Uncertainty } from "./types";

export type ActorKind = "person" | "agent" | "service";
export interface Actor { id: string; name: string; kind: ActorKind }

export type RecordKind = "campaign" | "observation" | "run" | "job" | "measurement" | "artifact" | "candidate" | "assessment" | "decision" | "note" | "agent_task";
export type Ref =
  | { kind: Exclude<RecordKind, "measurement" | "artifact">; id: string }
  | { kind: "measurement"; id: number }
  | { kind: "artifact"; id: string; sha256?: string }
  | { kind: "external"; uri: string | null; sha256: string; bytes: number; description?: string | null };

/** A reference of a candidate detail, with the record that the API resolved. */
export type ResolvedRef = Ref & { record?: ResolvedRecord | null };
export type ResolvedRecord =
  | (Measurement & { id: number; job_id: string; observation_id: string })
  | { id: string; run_id: string; observation_id: string | null; state: string; method: { id: string; version: number } }
  | { id: string; job_id: string; kind: string; bytes: number; sha256: string; content_url: string };

export type EvidenceStatus = "unreviewed" | "supported" | "ambiguous" | "rejected";
export type IdentityStatus = "unchecked" | "matched" | "unmatched" | "ambiguous";
export type Basis = "method" | "review" | "model_judgment";
export interface AxisStatus<S> { status: S; assessment_id: string | null; basis: Basis | null }

export type Withheld = "labels" | "identity" | "text";

export interface Candidate {
  id: string;
  campaign_id: string | null;
  label: string | null;
  kind: "transit_signal" | "moving_object";
  tier: "platform" | "lab";
  summary: string | null;
  observation_ids: string[];
  evidence: Ref[];
  import_key: string | null;
  text_withheld: boolean;
  status_rule: string;
  evidence_status: AxisStatus<EvidenceStatus> | null;
  identity_status: AxisStatus<IdentityStatus> | null;
  actor: Actor;
  created_at: string;
  withheld: Withheld[];
}

export interface Assessment {
  id: string; candidate_id: string; campaign_id: string | null;
  axis: "evidence" | "identity"; status: EvidenceStatus | IdentityStatus; basis: Basis;
  method: { id: string; version: number } | null; decision_id: string | null;
  reason: string | null; quality_flags: string[]; evidence: Ref[]; supersedes: string | null;
  import_key: string | null; text_withheld: boolean; actor: Actor; created_at: string;
}

export type Unavailable = { kind: "unavailable"; reason: string };
export interface Decision {
  id: string; candidate_id: string; campaign_id: string | null; assessment_id: string | null;
  question: { id: string; version: number }; mode: "advisory"; judge: "model" | "person"; model_judgment: boolean;
  model: { kind: "identified"; provider: string; id: string } | Unavailable | null;
  packet: { kind: "sha256"; sha256: string } | Unavailable;
  policy: { kind: "identified"; id: string; version: number } | Unavailable;
  judged_evidence_status: "supported" | "ambiguous" | "rejected"; action: string; reason: string | null;
  evidence: Ref[]; response: Record<string, unknown> | null; scores: Record<string, number> | null;
  withheld_from_writer: string[]; supersedes: string | null; import_key: string | null; text_withheld: boolean;
  actor: Actor; created_at: string;
}

export interface Note {
  id: string; campaign_id: string | null; body: string | null; subjects: Ref[];
  import_key: string | null; text_withheld: boolean; actor: Actor; created_at: string;
}

export type TaskState = "queued" | "claimed" | "complete" | "failed" | "cancelled";
export interface AgentTask {
  id: string; campaign_id: string; kind: string; title: string; instructions: string; priority: number;
  lease_seconds: number; max_attempts: number; state: TaskState; attempts: number;
  claimed_by: { id: string; name: string } | null; claimed_at: string | null; lease_expires_at: string | null; lease_expired: boolean;
  inputs: Ref[]; outputs: Ref[]; summary: string | null; reason: string | null; cancelled_by: string | null;
  text_withheld: boolean; actor: Actor; created_at: string; finished_at: string | null;
}

export interface CandidateDetail extends Omit<Candidate, "evidence"> {
  evidence: ResolvedRef[];
  observations: { id: string; target_id: string | null; sector: number | null; state: string }[];
  assessments: Assessment[];
  decisions: Decision[];
  notes: Note[];
}

export interface Budget { meaning: string; limit: number | null; used: number; remaining: number | null }
export interface Campaign {
  id: string; name: string; title: string; question: string; blinding: "open" | "labels" | "labels_identity";
  budgets: Record<string, number>; created_at: string;
  approved_at: string | null; decisions_fixed_at: string | null; revealed_at: string | null; closed_at: string | null;
  budget_state: Record<string, Budget>;
  clients: { id: string; name: string; kind: ActorKind; disabled_at: string | null }[];
  records: { candidates: number; assessments: number; decisions: number; notes: number; tasks: Record<string, number> };
}

export interface ListPage<T> { total: number; limit: number; offset: number; items: T[]; withheld?: Withheld[] }

/** GET /api/runs/compare, rule run-comparison/1. Differences are display calculations, not stored results. */
export interface ComparedMeasurement extends Measurement { id: number }
export interface CompareSide {
  job_id: string; state: string; outcome: string | null; error: { kind?: string; message?: string | null } | null;
  measurements: Partial<Record<Measurement["role"], Record<string, ComparedMeasurement>>>;
}
export interface Difference { value: number; unit: string; display_calculation: true; rule: string; uncertainty: Uncertainty }
export interface CompareRow {
  observation_id: string; target_id: string | null; sector: number | null;
  a: CompareSide | null; b: CompareSide | null;
  differences: Partial<Record<Measurement["role"], Record<string, Difference>>>;
}
export interface Comparison {
  rule: string; display_calculation: true;
  run_a: RunSummary; run_b: RunSummary;
  parameters_equal: boolean; parameter_differences: { path: string; a: unknown; b: unknown }[];
  summary: { observations: number; in_both: number; only_a: number; only_b: number; state_differs: number };
  total: number; limit: number; offset: number; withheld: Withheld[]; protected_excluded: number;
  rows: CompareRow[];
}

/** The result of a write: the record, or the API's refusal with errors by field path. */
export type WriteResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; message: string; fieldErrors: Map<string, string> };

/** POST a JSON body. A 422 maps each error to its path below "body", for example "reason" or "question.id". */
export async function postJson<T>(path: string, body: unknown): Promise<WriteResult<T>> {
  const res = await apiFetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return { ok: true, status: res.status, data: (await res.json()) as T };
  const fieldErrors = new Map<string, string>();
  let message = `${res.status} ${res.statusText}`;
  try {
    const b = (await res.json()) as { detail: unknown };
    if (typeof b.detail === "string") message = b.detail;
    else if (Array.isArray(b.detail)) {
      const loose: string[] = [];
      for (const e of b.detail as { loc: (string | number)[]; msg: string }[]) {
        const loc = e.loc.map(String), key = (loc[0] === "body" ? loc.slice(1) : loc).join(".");
        if (key) fieldErrors.set(key, e.msg); else loose.push(e.msg);
      }
      message = loose.length ? loose.join(" · ") : [...fieldErrors].map(([k, v]) => `${k}: ${v}`).join(" · ");
    } else if (b.detail && typeof b.detail === "object") message = JSON.stringify(b.detail);
  } catch { /* The body was not JSON. The status line is the message. */ }
  return { ok: false, status: res.status, message, fieldErrors };
}

export const records = {
  candidates: (q = "") => getJson<ListPage<Candidate>>(`/candidates?limit=1000${q}`),
  candidate: (id: string) => getJson<CandidateDetail>(`/candidates/${id}`),
  tasks: (q = "") => getJson<ListPage<AgentTask>>(`/tasks?limit=1000${q}`),
  campaigns: () => getJson<{ items: Campaign[] }>("/campaigns").then((r) => r.items),
  compare: (a: string, b: string) => getJson<Comparison>(`/runs/compare?run_a=${a}&run_b=${b}&limit=1000`),
};
