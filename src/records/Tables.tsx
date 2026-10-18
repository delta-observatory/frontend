import type { AgentTask, Campaign, Candidate } from "../api/records";
import type { Target } from "../data/catalogue";
import { Actor, Chip, Tier } from "./marks";
import { clock, leaseLeft, short, when } from "./view";

export type Selection = { kind: "candidate"; id: string } | { kind: "task"; id: string } | { kind: "new-candidate" } | null;

/** The target name of a candidate: the planet name or the TIC of its first observation. Null when identity is withheld. */
export function candidateTarget(c: Candidate, targetsById: Map<string, Target>): string {
  for (const o of c.observation_ids) {
    const t = targetsById.get(o);
    if (t) return t.name ?? t.tic.replace("TIC:", "TIC ");
  }
  return c.observation_ids.length ? `obs ${short(c.observation_ids[0]!)}` : "—";
}

interface CandProps {
  list: Candidate[] | null;
  targetsById: Map<string, Target>;
  campaigns: Map<string, Campaign>;
  selected: Selection;
  wide?: boolean;
  onSelect: (c: Candidate) => void;
}

/** Candidates, newest first. Status: rule candidate-status/1, the newest assessment on each axis. */
export function CandidateTable({ list, targetsById, campaigns, selected, wide, onSelect }: CandProps) {
  if (list == null) return <div className="empty">Loading the candidates…</div>;
  return (
    <table className="records-table">
      <thead>
        <tr>
          <th>ID</th><th>target</th>{wide && <th>kind</th>}<th>tier</th><th>evidence</th><th>identity</th>
          {wide && <><th>campaign</th><th className="n">obs</th><th>summary</th></>}<th>by</th>{wide && <th>written</th>}
        </tr>
      </thead>
      <tbody>
        {list.map((c) => (
          <tr key={c.id} className={selected?.kind === "candidate" && selected.id === c.id ? "sel" : ""} onClick={() => onSelect(c)}>
            <td>{c.label ?? short(c.id)}</td>
            <td className="nm">{candidateTarget(c, targetsById)}</td>
            {wide && <td>{c.kind === "transit_signal" ? "transit" : "moving"}</td>}
            <td><Tier c={c} short={!wide} /></td>
            <td><Chip status={c.evidence_status?.status ?? "unreviewed"} /></td>
            <td>{c.withheld.includes("labels") ? <span className="wh">withheld</span> : <Chip status={c.identity_status?.status ?? "unchecked"} />}</td>
            {wide && <>
              <td>{c.campaign_id ? campaigns.get(c.campaign_id)?.name ?? short(c.campaign_id) : "none"}</td>
              <td className="n">{c.observation_ids.length}</td>
              <td className="nm summary">{c.summary ?? (c.text_withheld ? <span className="wh">text withheld</span> : "—")}</td>
            </>}
            <td><Actor a={c.actor} kind={false} /></td>
            {wide && <td>{when(c.created_at)}</td>}
          </tr>
        ))}
        {list.length === 0 && <tr><td colSpan={wide ? 11 : 6} className="none">No candidate record matches.</td></tr>}
      </tbody>
    </table>
  );
}

interface TaskProps { list: AgentTask[] | null; selected: Selection; now: number; onSelect: (t: AgentTask) => void }

/** Agent tasks in claim order: the highest priority first, then the oldest. */
export function TaskTable({ list, selected, now, onSelect }: TaskProps) {
  if (list == null) return <div className="empty">Loading the agent tasks…</div>;
  return (
    <table className="records-table">
      <thead><tr><th className="n">pri</th><th>kind</th><th>title</th><th>state</th><th className="n">tries</th><th>holder</th><th className="n">lease</th></tr></thead>
      <tbody>
        {list.map((t) => {
          const left = leaseLeft(t, now);
          return (
            <tr key={t.id} className={selected?.kind === "task" && selected.id === t.id ? "sel" : ""} onClick={() => onSelect(t)}>
              <td className="n">{t.priority}</td>
              <td>{t.kind}</td>
              <td className="nm">{t.title}</td>
              <td><span className={`tst tst-${t.state}`}>{t.state}</span></td>
              <td className="n">{t.attempts}/{t.max_attempts}</td>
              <td>{t.claimed_by ? `◆ ${t.claimed_by.name}` : "—"}</td>
              <td className="n">{left == null ? (t.state === "complete" || t.state === "failed" ? "ended" : "—") : left > 0 ? `${clock(left)} left` : "expired"}</td>
            </tr>
          );
        })}
        {list.length === 0 && <tr><td colSpan={7} className="none">No agent task exists.</td></tr>}
      </tbody>
    </table>
  );
}
