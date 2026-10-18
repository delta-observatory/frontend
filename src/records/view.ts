// Display helpers for research records. They format API values. They calculate no stored value.
import type { ActorKind, AgentTask, Assessment, Campaign, Candidate, CandidateDetail, Decision, Note, Ref } from "../api/records";

/** Writer marks of the record vocabulary: ● person, ◆ agent, ■ service. */
export const GLYPH: Record<ActorKind, string> = { person: "●", agent: "◆", service: "■" };

/** Border style of a status chip: dotted for no assessment, dashed for ambiguous, struck for rejected, solid otherwise. */
export function chipClass(status: string | null | undefined): string {
  if (status == null || status === "unreviewed" || status === "unchecked") return "chip open";
  if (status === "ambiguous") return "chip amb";
  if (status === "rejected") return "chip rej";
  return "chip";
}

export const short = (id: string | number) => String(id).slice(0, 8);

/** A short name for a reference: m 4417, job 344f44fc, ↗ file name. */
export function refLabel(r: Ref): string {
  switch (r.kind) {
    case "measurement": return `m ${r.id}`;
    case "external": return r.uri ? `↗ ${r.uri.split("/").pop()}` : "↗ withheld";
    case "agent_task": return `task ${short(r.id)}`;
    default: return `${r.kind} ${short(r.id)}`;
  }
}

export type HistoryItem =
  | { type: "assessment"; at: string; actor: Assessment["actor"]; record: Assessment }
  | { type: "decision"; at: string; actor: Decision["actor"]; record: Decision }
  | { type: "note"; at: string; actor: Note["actor"]; record: Note };

/** Assessments, decisions, and notes of a candidate, newest first. Records do not change, so the order is stable. */
export function history(d: Pick<CandidateDetail, "assessments" | "decisions" | "notes">): HistoryItem[] {
  const items: HistoryItem[] = [
    ...d.assessments.map((r) => ({ type: "assessment" as const, at: r.created_at, actor: r.actor, record: r })),
    ...d.decisions.map((r) => ({ type: "decision" as const, at: r.created_at, actor: r.actor, record: r })),
    ...d.notes.map((r) => ({ type: "note" as const, at: r.created_at, actor: r.actor, record: r })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Seconds until the lease of a claimed task expires. Negative after expiry. Null without a lease. */
export function leaseLeft(t: Pick<AgentTask, "state" | "lease_expires_at">, now: number): number | null {
  if (t.state !== "claimed" || !t.lease_expires_at) return null;
  return (Date.parse(t.lease_expires_at) - now) / 1000;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const CAMPAIGN_STAGES = ["created", "approved", "decisions fixed", "revealed", "closed"] as const;
/** The last lifecycle event of a campaign, as an index in CAMPAIGN_STAGES. */
export function campaignStage(c: Pick<Campaign, "approved_at" | "decisions_fixed_at" | "revealed_at" | "closed_at">): number {
  return c.closed_at ? 4 : c.revealed_at ? 3 : c.decisions_fixed_at ? 2 : c.approved_at ? 1 : 0;
}

export const TASK_STAGES = ["queued", "claimed", "complete", "failed", "cancelled"] as const;

export const BLINDING: Record<Campaign["blinding"], string> = {
  open: "nothing withheld from agents",
  labels: "labels withheld from agents",
  labels_identity: "labels and identity withheld from agents",
};

export interface CandidateFilter {
  campaign: string | "all" | "none";
  tier: "all" | Candidate["tier"];
  kind: "all" | Candidate["kind"];
  evidence: "all" | string;
  identity: "all" | string;
  writer: "all" | string;
  text: string;
}
export const NO_FILTER: CandidateFilter = { campaign: "all", tier: "all", kind: "all", evidence: "all", identity: "all", writer: "all", text: "" };

/** Filters a candidate list. A status filter uses the status that the API gives. A null status matches "unreviewed" or "unchecked". */
export function filterCandidates(list: Candidate[], f: CandidateFilter, nameOf: (c: Candidate) => string = () => ""): Candidate[] {
  const text = f.text.trim().toLowerCase();
  return list.filter((c) =>
    (f.campaign === "all" || (f.campaign === "none" ? c.campaign_id == null : c.campaign_id === f.campaign)) &&
    (f.tier === "all" || c.tier === f.tier) &&
    (f.kind === "all" || c.kind === f.kind) &&
    (f.evidence === "all" || (c.evidence_status?.status ?? "unreviewed") === f.evidence) &&
    (f.identity === "all" || (c.identity_status?.status ?? "unchecked") === f.identity) &&
    (f.writer === "all" || c.actor.name === f.writer) &&
    (!text || [c.label, c.summary, nameOf(c), c.id].some((s) => s?.toLowerCase().includes(text))));
}

/** References of a candidate that an assessment or a decision can cite as its evidence: platform records, and external
 * files whose URI the client sees. The resolved record of a candidate detail is not part of a reference. */
export function citable(evidence: (Ref & { record?: unknown })[]): Ref[] {
  return evidence.filter((r) => r.kind !== "external" || r.uri != null).map((r) => {
    const { record: _, ...ref } = r;
    return ref as Ref;
  });
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
