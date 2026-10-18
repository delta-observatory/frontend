import { Fragment, useEffect, useState, type ReactNode } from "react";
import { denied, useAccess } from "../api/access";
import { getJson } from "../api/client";
import { postJson, records, type AgentTask, type Campaign, type CandidateDetail, type Ref, type ResolvedRef, type WriteResult } from "../api/records";
import type { Measurement, MethodInfo } from "../api/types";
import type { Target } from "../data/catalogue";
import type { Evidence } from "../data/evidence";
import { formatMeasurement } from "../Inspector";
import { Actor, Chip, ModelJudgment, Tier, WithheldMark } from "./marks";
import type { Selection } from "./Tables";
import { BLINDING, CAMPAIGN_STAGES, campaignStage, citable, clock, history, leaseLeft, refLabel, short, TASK_STAGES, when } from "./view";

const NAME: Record<string, string> = { period: "period", transit_time: "transit time", duration: "duration", depth: "depth", depth_snr: "depth S/N",
  log_likelihood: "log likelihood", depth_odd: "depth, odd", depth_even: "depth, even", observed_transit_count: "transits observed" };
const FLAG: Record<string, string> = { trend_removal_can_reduce_depth: "DETREND", guided_comparison: "GUIDED" };

interface Props {
  selection: Selection;
  campaigns: Map<string, Campaign>;
  tasks: AgentTask[] | null;
  targetsById: Map<string, Target>;
  methods: Map<string, MethodInfo>;
  current: Target | null;
  evidence: Evidence | null;
  now: number;
  onSelect: (s: Selection) => void;
  onDetail: (d: CandidateDetail) => void;
  onExport: (s: { kind: "candidate"; id: string; label: string }) => void;
  onChanged: () => void;
}

/** The Records tab: one candidate or one agent task, with its history and the write forms. */
export function RecordsPanel(p: Props) {
  const s = p.selection;
  const refused = denied(useAccess(), "records");
  return (
    <div className="scroll"><div className="ibody records">
      {s?.kind === "candidate" && <CandidateView key={s.id} id={s.id} {...p} />}
      {s?.kind === "task" && <TaskView key={s.id} task={p.tasks?.find((t) => t.id === s.id) ?? null} {...p} />}
      {s?.kind === "new-candidate" && <NewCandidate {...p} />}
      {s == null && (
        <>
          <div className="empty">No record selected. Select a candidate or an agent task in the catalogue panel, or in the EVIDENCE workspace.</div>
          <div className="btns"><button className="pri" disabled={!p.evidence || refused != null} title={refused ?? undefined} onClick={() => p.onSelect({ kind: "new-candidate" })}>New candidate from the shown result…</button><NewTaskButton {...p} /></div>
          {refused && <div className="small">{refused}</div>}
        </>
      )}
    </div></div>
  );
}

// ---------- Candidate ----------

function CandidateView(p: Props & { id: string }) {
  const refused = denied(useAccess(), "records");
  const [d, setD] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState<"assess" | "decide" | "note" | "task" | null>(null);
  useEffect(() => {
    let live = true;
    records.candidate(p.id).then((x) => { if (live) { setD(x); p.onDetail(x); } }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, version]);
  if (error) return <div className="error-inline">{error}</div>;
  if (!d) return <div className="empty">Loading the candidate…</div>;
  const written = () => { setForm(null); setVersion((v) => v + 1); p.onChanged(); };
  const assessments = new Map(d.assessments.map((a) => [a.id, a]));
  const axis = (k: "evidence" | "identity") => {
    const s = k === "evidence" ? d.evidence_status : d.identity_status, a = s?.assessment_id ? assessments.get(s.assessment_id) : null;
    const withheld = k === "identity" && d.withheld.includes("labels");
    return (
      <div className="axis">
        <span className="k">{k.toUpperCase()}</span>
        {withheld ? <WithheldMark what="withheld" /> : <Chip status={s?.status ?? (k === "evidence" ? "unreviewed" : "unchecked")} />}
        <span className="small">{a ? <>{a.basis.replace("_", " ")} · <Actor a={a.actor} kind={false} /> · {when(a.created_at)}</> : s?.assessment_id ? "source assessment not visible to this client" : s ? "no assessment on this axis" : "status not visible to this client"}</span>
      </div>
    );
  };
  const jobs = d.evidence.filter((r) => r.kind === "job").map((r) => r.record as { method?: { id: string; version: number } } | undefined);
  const methodKeys = [...new Set(jobs.map((j) => j?.method && `${j.method.id}/${j.method.version}`).filter(Boolean) as string[])];
  const campaign = d.campaign_id ? p.campaigns.get(d.campaign_id) : null;
  return (
    <>
      <div className="rec-head">
        <b>{d.label ?? short(d.id)}</b><Tier c={d} />
        <span className="small">{d.kind === "transit_signal" ? "transit signal" : "moving object"} · campaign {campaign?.name ?? (d.campaign_id ? short(d.campaign_id) : "none")} · by</span>
        <Actor a={d.actor} /><span className="small">{when(d.created_at)}</span>
      </div>
      {d.withheld.length > 0 && <div className="small">Withheld from this client: {d.withheld.map((w) => <WithheldMark key={w} what={w} />)}</div>}
      <h3>Status · two separate axes · rule {d.status_rule}</h3>
      {axis("evidence")}
      {axis("identity")}
      <h3>Summary</h3>
      <div className="text">{d.summary ?? (d.text_withheld ? <WithheldMark what="text" /> : "—")}</div>
      <h3>Evidence · stored values the record refers to</h3>
      <EvidenceTable refs={d.evidence} />
      {d.tier === "lab" && <div className="small">↗ External proposal. The platform lists each file by URI, size, and SHA-256. It does not hold or check the file content.</div>}
      {methodKeys.map((k) => { const m = p.methods.get(k); return m ? <div key={k} className="prov"><b className="id">{m.id} v{m.version}</b> · {m.scientific_status}</div> : null; })}
      <h3>History · newest first · records do not change</h3>
      <History d={d} />
      <div className="btns">
        <button className={form === "assess" ? "pri" : ""} disabled={refused != null} title={refused ?? undefined} onClick={() => setForm(form === "assess" ? null : "assess")}>Assess…</button>
        <button className={form === "decide" ? "pri" : ""} disabled={refused != null} title={refused ?? undefined} onClick={() => setForm(form === "decide" ? null : "decide")}>Decide…</button>
        <button className={form === "note" ? "pri" : ""} disabled={refused != null} title={refused ?? undefined} onClick={() => setForm(form === "note" ? null : "note")}>Note…</button>
        {d.campaign_id && <button className={form === "task" ? "pri" : ""} disabled={refused != null} title={refused ?? undefined} onClick={() => setForm(form === "task" ? null : "task")}>Task…</button>}
        <button className="right" onClick={() => p.onExport({ kind: "candidate", id: d.id, label: d.label ?? short(d.id) })}>Export candidate…</button>
      </div>
      {refused && <div className="small">{refused}</div>}
      {form === "assess" && <AssessForm d={d} onDone={written} />}
      {form === "decide" && <DecideForm d={d} onDone={written} />}
      {form === "note" && <NoteForm subjects={[{ kind: "candidate", id: d.id }]} onDone={written} />}
      {form === "task" && d.campaign_id && <TaskForm campaigns={p.campaigns} campaignId={d.campaign_id} inputs={[{ kind: "candidate", id: d.id }]} onDone={(id) => { setForm(null); p.onChanged(); p.onSelect({ kind: "task", id }); }} />}
    </>
  );
}

function EvidenceTable({ refs }: { refs: ResolvedRef[] }) {
  // Footnotes give the stored reason of each unavailable uncertainty.
  const notes: string[] = [];
  const table = (
    <table className="ev">
      <thead><tr><th>ref</th><th>quantity</th><th className="n">value</th><th className="n">uncert.</th><th>unit</th><th>flags</th></tr></thead>
      <tbody>
        {refs.map((r, i) => {
          const rec = r.record as Record<string, unknown> | null | undefined;
          if (r.kind === "measurement" && rec && "value" in rec) {
            const m = rec as unknown as Measurement, f = formatMeasurement(m);
            let unc: ReactNode = f.unc;
            if (f.reason) { notes.push(f.reason); unc = <span title={f.reason}>—<sup>{notes.length}</sup></span>; }
            return (
              <tr key={i}>
                <td>{refLabel(r)}</td><td className="k">{NAME[m.name] ?? m.name.replace(/_/g, " ")}{m.role === "reference_comparison" ? " (ref.)" : ""}</td>
                <td className="n">{f.value}</td><td className="n">{unc}</td><td className="unit">{m.unit}{m.time_scale ? ` ${m.time_scale.toUpperCase()}` : ""}</td>
                <td>{m.quality_flags.map((q) => <span key={q} className="flag" title={q}>{FLAG[q] ?? q}</span>)}</td>
              </tr>
            );
          }
          let text: ReactNode;
          if (r.kind === "external") text = <>{r.uri ?? <WithheldMark what="text" />} · sha256 {r.sha256.slice(0, 12)}… · {(r.bytes / 1024).toFixed(1)} KiB{r.description ? ` · ${r.description}` : ""} · <i>external proposal</i></>;
          else if (r.kind === "job" && rec) { const j = rec as { run_id: string; state: string; method: { id: string; version: number } }; text = <>{j.method.id} v{j.method.version} · {j.state} · run {short(j.run_id)}</>; }
          else if (r.kind === "artifact" && rec) { const a = rec as { kind: string; sha256: string; bytes: number }; text = <>{a.kind} · sha256 {a.sha256.slice(0, 12)}… · {(a.bytes / 1e6).toFixed(2)} MB</>; }
          else text = rec === null ? "not visible to this client" : "";
          return <tr key={i}><td>{refLabel(r)}</td><td colSpan={5} className="nm">{text}</td></tr>;
        })}
        {refs.length === 0 && <tr><td colSpan={6} className="none">No evidence reference.</td></tr>}
      </tbody>
    </table>
  );
  return (
    <>
      {table}
      {notes.length > 0 && <div className="small">{notes.map((n, i) => <div key={i}><sup>{i + 1}</sup> uncertainty unavailable: {n}</div>)}</div>}
    </>
  );
}

function History({ d }: { d: CandidateDetail }) {
  const items = history(d);
  if (!items.length) return <div className="empty">No assessment, decision, or note.</div>;
  return (
    <div className="tl">
      {items.map((h) => {
        const head = <>{when(h.at)} · <Actor a={h.actor} /></>;
        if (h.type === "assessment") {
          const a = h.record;
          return <div key={a.id} className="item"><span className="t">{head} · ASSESSMENT · {a.axis} → <Chip status={a.status} /> · {a.basis.replace("_", " ")}{a.method ? ` ${a.method.id} v${a.method.version}` : ""}{a.supersedes ? ` · supersedes ${short(a.supersedes)}` : ""}</span>
            <p>{a.reason ?? <WithheldMark what="text" />}{a.decision_id && <span className="small"> · cites decision {short(a.decision_id)}</span>}</p></div>;
        }
        if (h.type === "decision") {
          const x = h.record;
          const model = x.model == null ? null : x.model.kind === "identified" ? `${x.model.provider} / ${x.model.id}` : `unavailable (${x.model.reason})`;
          return (
            <div key={x.id} className="item"><span className="t">{head} · DECISION {x.model_judgment && <ModelJudgment />}</span>
              <p>judged evidence: <Chip status={x.judged_evidence_status} /> · action: {x.action.replace(/_/g, " ")} · question {x.question.id} v{x.question.version}</p>
              <p className="small">{model && <>model: {model} · </>}packet: {x.packet.kind === "sha256" ? `sha256 ${x.packet.sha256.slice(0, 12)}…` : `unavailable (${x.packet.reason})`} · policy: {x.policy.kind === "identified" ? `${x.policy.id} v${x.policy.version}` : `unavailable (${x.policy.reason})`}
                {x.scores && <> · scores {JSON.stringify(x.scores)}: judgments, not probabilities</>}{x.withheld_from_writer.length > 0 && <> · withheld from the writer: {x.withheld_from_writer.join(", ")}</>}</p>
              <p>{x.reason ?? <WithheldMark what="text" />}</p>
            </div>
          );
        }
        const n = h.record;
        return <div key={n.id} className="item"><span className="t">{head} · NOTE</span><p>{n.body ?? <WithheldMark what="text" />}</p></div>;
      })}
    </div>
  );
}

// ---------- Forms ----------

function useWrite<T>() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WriteResult<T> | null>(null);
  const run = async (f: () => Promise<WriteResult<T>>, ok: (data: T) => void) => {
    setBusy(true);
    try { const r = await f(); setResult(r); if (r.ok) ok(r.data); }
    catch (e) { setResult({ ok: false, status: 0, message: (e as Error).message, fieldErrors: new Map() }); }
    finally { setBusy(false); }
  };
  const err = (key: string) => (result && !result.ok ? result.fieldErrors.get(key) ?? null : null);
  const message = result && !result.ok ? result.message : null;
  return { busy, run, err, message };
}

function Field({ label, error, children }: { label: string; error: string | null; children: ReactNode }) {
  return <label className={`field${error ? " bad" : ""}`}><span>{label}</span>{children}{error && <em>{error}</em>}</label>;
}

const EVIDENCE_STATUS = ["unreviewed", "supported", "ambiguous", "rejected"];
const IDENTITY_STATUS = ["unchecked", "matched", "unmatched", "ambiguous"];

function AssessForm({ d, onDone }: { d: CandidateDetail; onDone: () => void }) {
  const [axis, setAxis] = useState<"evidence" | "identity">("evidence");
  const [status, setStatus] = useState("supported");
  const [reason, setReason] = useState("");
  const w = useWrite<unknown>();
  const current = (axis === "evidence" ? d.evidence_status : d.identity_status)?.assessment_id ?? null;
  const evidence = citable(d.evidence);
  const options = axis === "evidence" ? EVIDENCE_STATUS : IDENTITY_STATUS;
  const submit = () => w.run(() => postJson("/assessments", {
    contract: "assessment/1", candidate_id: d.id, axis, status, basis: "review", reason,
    ...(status === "unreviewed" || status === "unchecked" ? {} : { evidence }), ...(current ? { supersedes: current } : {}),
  }), onDone);
  return (
    <div className="form">
      <div className="small">A review by you, with basis review. It cites the {evidence.length} evidence reference{evidence.length === 1 ? "" : "s"} of the candidate{current ? ` and supersedes assessment ${short(current)}` : ""}.</div>
      <Field label="axis" error={w.err("axis")}><select value={axis} onChange={(e) => { const a = e.target.value as "evidence" | "identity"; setAxis(a); setStatus(a === "evidence" ? "supported" : "matched"); }}><option value="evidence">evidence</option><option value="identity">identity</option></select></Field>
      <Field label="status" error={w.err("status")}><select value={status} onChange={(e) => setStatus(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select></Field>
      <Field label="reason" error={w.err("reason")}><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
      {w.err("evidence") && <div className="error-inline">evidence: {w.err("evidence")}</div>}
      {w.message && <div className="error-inline">{w.message}</div>}
      <div className="btns"><button className="pri" disabled={w.busy || !reason.trim()} onClick={submit}>{w.busy ? "Writing…" : "Write assessment"}</button></div>
    </div>
  );
}

const ACTIONS = ["no_action", "request_human_review", "request_vetting", "request_pixel_check", "request_more_data", "discard"];

function DecideForm({ d, onDone }: { d: CandidateDetail; onDone: () => void }) {
  const [question, setQuestion] = useState("review");
  const [version, setVersion] = useState("1");
  const [judged, setJudged] = useState("supported");
  const [action, setAction] = useState("no_action");
  const [reason, setReason] = useState("");
  const [packet, setPacket] = useState("The person read the records and plots in the frontend. No evidence packet exists.");
  const [policy, setPolicy] = useState("No decision policy exists for this question.");
  const w = useWrite<unknown>();
  const evidence = citable(d.evidence);
  const submit = () => w.run(() => postJson("/decisions", {
    contract: "decision/1", candidate_id: d.id, question: { id: question, version: Number(version) }, mode: "advisory", judge: "person",
    packet: { kind: "unavailable", reason: packet }, policy: { kind: "unavailable", reason: policy },
    judged_evidence_status: judged, action, reason, evidence,
  }), onDone);
  return (
    <div className="form">
      <div className="small">A person's advisory judgment. It sets no status and schedules nothing. Write an assessment to change the evidence status.</div>
      <div className="row2">
        <Field label="question" error={w.err("question.id")}><input value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
        <Field label="version" error={w.err("question.version")}><input value={version} inputMode="numeric" onChange={(e) => setVersion(e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label="judged evidence" error={w.err("judged_evidence_status")}><select value={judged} onChange={(e) => setJudged(e.target.value)}>{["supported", "ambiguous", "rejected"].map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="action" error={w.err("action")}><select value={action} onChange={(e) => setAction(e.target.value)}>{ACTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}</select></Field>
      </div>
      <Field label="reason" error={w.err("reason")}><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
      <Field label="packet: reason unavailable" error={w.err("packet")}><input value={packet} onChange={(e) => setPacket(e.target.value)} /></Field>
      <Field label="policy: reason unavailable" error={w.err("policy")}><input value={policy} onChange={(e) => setPolicy(e.target.value)} /></Field>
      {w.message && <div className="error-inline">{w.message}</div>}
      <div className="btns"><button className="pri" disabled={w.busy || !reason.trim()} onClick={submit}>{w.busy ? "Writing…" : "Write decision"}</button></div>
    </div>
  );
}

function NoteForm({ subjects, onDone }: { subjects: Ref[]; onDone: () => void }) {
  const [body, setBody] = useState("");
  const w = useWrite<unknown>();
  return (
    <div className="form">
      <div className="small">A note changes no value. It takes the campaign of its subjects: {subjects.map(refLabel).join(", ")}.</div>
      <Field label="note" error={w.err("body")}><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} /></Field>
      {w.message && <div className="error-inline">{w.message}</div>}
      <div className="btns"><button className="pri" disabled={w.busy || !body.trim()} onClick={() => w.run(() => postJson("/notes", { contract: "note/1", body, subjects }), onDone)}>{w.busy ? "Writing…" : "Write note"}</button></div>
    </div>
  );
}

function NewCandidate(p: Props) {
  const ev = p.evidence;
  const search = ev?.job.measurements.search ?? [];
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(search.filter((m) => ["period", "transit_time", "duration", "depth", "depth_snr"].includes(m.name) && m.id != null).map((m) => m.id!)));
  const [label, setLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [campaign, setCampaign] = useState("");
  const w = useWrite<{ id: string }>();
  if (!ev) return <div className="empty">Select a target with a complete job first. The candidate refers to that job and its measurements.</div>;
  const t = p.targetsById.get(ev.observation.id);
  const open = [...p.campaigns.values()].filter((c) => !c.closed_at && c.approved_at && !c.decisions_fixed_at);
  const submit = () => w.run(() => postJson<{ id: string }>(`/candidates${campaign ? `?campaign_id=${campaign}` : ""}`, {
    contract: "candidate/1", kind: "transit_signal", tier: "platform", ...(label.trim() ? { label: label.trim() } : {}), summary,
    observation_ids: [ev.observation.id], evidence: [{ kind: "job", id: ev.job.job_id }, ...[...chosen].map((id) => ({ kind: "measurement", id }))],
  }), (c) => { p.onChanged(); p.onSelect({ kind: "candidate", id: c.id }); });
  return (
    <div className="form">
      <h3>New candidate · platform tier</h3>
      <div className="small">Target <b>{t?.name ?? t?.tic ?? short(ev.observation.id)}</b> · job {short(ev.job.job_id)} · run {short(ev.runId)}. The candidate refers to the job and the chosen measurements. It copies no value.</div>
      <div className="row2">
        <Field label="label (optional, no catalog identity)" error={w.err("label")}><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="D001" /></Field>
        <Field label="campaign" error={w.err("campaign_id")}><select value={campaign} onChange={(e) => setCampaign(e.target.value)}><option value="">none</option>{open.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      </div>
      <Field label="summary" error={w.err("summary")}><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} /></Field>
      <div className="checks">
        {search.filter((m) => m.id != null).map((m) => (
          <label key={m.id}><input type="checkbox" checked={chosen.has(m.id!)} onChange={() => { const n = new Set(chosen); if (n.has(m.id!)) n.delete(m.id!); else n.add(m.id!); setChosen(n); }} />{NAME[m.name] ?? m.name} <span className="small">m {m.id}</span></label>
        ))}
      </div>
      {search.some((m) => m.id == null) && <div className="small">This API release gives no measurement IDs. The candidate can refer to the job only.</div>}
      {w.err("evidence") && <div className="error-inline">evidence: {w.err("evidence")}</div>}
      {w.message && <div className="error-inline">{w.message}</div>}
      <div className="btns"><button className="pri" disabled={w.busy || !summary.trim()} onClick={submit}>{w.busy ? "Writing…" : "Write candidate"}</button><button onClick={() => p.onSelect(null)}>Cancel</button></div>
    </div>
  );
}

// ---------- Agent task ----------

function NewTaskButton(p: Props) {
  const [open, setOpen] = useState(false);
  const refused = denied(useAccess(), "records");
  const live = [...p.campaigns.values()].filter((c) => !c.closed_at);
  if (!live.length) return null;
  return (
    <>
      <button disabled={refused != null} title={refused ?? undefined} onClick={() => setOpen(!open)}>New task…</button>
      {open && <TaskForm campaigns={p.campaigns} campaignId={live[0]!.id} inputs={[]} onDone={(id) => { setOpen(false); p.onChanged(); p.onSelect({ kind: "task", id }); }} />}
    </>
  );
}

function TaskForm({ campaigns, campaignId, inputs, onDone }: { campaigns: Map<string, Campaign>; campaignId: string; inputs: Ref[]; onDone: (id: string) => void }) {
  const [campaign, setCampaign] = useState(campaignId);
  const [kind, setKind] = useState("vetting");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState("50");
  const w = useWrite<{ id: string }>();
  const live = [...campaigns.values()].filter((c) => !c.closed_at);
  return (
    <div className="form">
      <div className="small">The title and instructions are directed text: the agents of the campaign receive them. Keep withheld values out of them. Inputs: {inputs.length ? inputs.map(refLabel).join(", ") : "none"}.</div>
      <div className="row2">
        <Field label="campaign" error={w.err("campaign_id")}><select value={campaign} onChange={(e) => setCampaign(e.target.value)}>{live.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="kind" error={w.err("kind")}><input value={kind} onChange={(e) => setKind(e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label="title" error={w.err("title")}><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="priority 0–100" error={w.err("priority")}><input value={priority} inputMode="numeric" onChange={(e) => setPriority(e.target.value)} /></Field>
      </div>
      <Field label="instructions" error={w.err("instructions")}><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} /></Field>
      {w.message && <div className="error-inline">{w.message}</div>}
      <div className="btns"><button className="pri" disabled={w.busy || !title.trim()} onClick={() => w.run(() => postJson<{ id: string }>(`/tasks?campaign_id=${campaign}`, { contract: "agent-task/1", kind, title, instructions, priority: Number(priority), inputs }), (t) => onDone(t.id))}>{w.busy ? "Writing…" : "Write task"}</button></div>
    </div>
  );
}

function Track({ stages, at, ended }: { stages: readonly string[]; at: number; ended?: boolean }) {
  return (
    <div className="track">
      {stages.map((s, i) => <Fragment key={s}>{i > 0 && <i />}<span className={i === at ? "now" : i < at && !ended ? "done" : ""}>{s}</span></Fragment>)}
    </div>
  );
}

export function CampaignBlock({ c }: { c: Campaign }) {
  const stage = campaignStage(c);
  const withheld = c.revealed_at || c.blinding === "open" ? [] : c.blinding === "labels" ? ["labels", "text"] : ["labels", "identity", "text"];
  return (
    <>
      <h3>Campaign {c.name}</h3>
      <div className="small">{c.title} · {BLINDING[c.blinding]}{c.revealed_at ? " until the reveal (done)" : ""}</div>
      <Track stages={CAMPAIGN_STAGES} at={stage} />
      {Object.entries(c.budget_state).map(([k, b]) => (
        <div key={k} className="bud" title={b.meaning}>
          <span>{k.replace(/_/g, " ")}</span>
          <span className="bar2">{b.limit != null && b.limit > 0 && <span style={{ width: `${Math.min(100, (100 * b.used) / b.limit)}%` }} />}</span>
          <span className="n">{Math.round(b.used).toLocaleString("en-US")} / {b.limit == null ? "no limit" : b.limit.toLocaleString("en-US")}</span>
        </div>
      ))}
      {withheld.length > 0 && <div className="small">Agents of this campaign do not receive: {withheld.map((w) => <WithheldMark key={w} what={w} />)} · rule free-text/1</div>}
    </>
  );
}

function TaskView(p: Props & { task: AgentTask | null }) {
  const t = p.task;
  const refused = denied(useAccess(), "records");
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const w = useWrite<unknown>();
  const [inputsDetail, setInputs] = useState<Record<string, string>>({});
  useEffect(() => {
    // Names of candidate inputs, for the table.
    if (!t) return;
    for (const r of t.inputs) if (r.kind === "candidate") getJson<{ label: string | null }>(`/candidates/${r.id}`).then((c) => setInputs((x) => ({ ...x, [r.id]: c.label ?? short(r.id) })), () => {});
  }, [t]);
  if (!t) return <div className="empty">The task is not in the list.</div>;
  const c = p.campaigns.get(t.campaign_id);
  const left = leaseLeft(t, p.now);
  const at = TASK_STAGES.indexOf(t.state);
  return (
    <>
      {c && <CampaignBlock c={c} />}
      <h3>Task · {t.kind}</h3>
      <div className="rec-head"><b>{t.title}</b><span className="small">priority {t.priority}</span></div>
      <Track stages={TASK_STAGES} at={at} ended={t.state === "failed" || t.state === "cancelled"} />
      <div className="small">
        attempt {t.attempts} of {t.max_attempts} · lease length {t.lease_seconds} s
        {t.claimed_by && <> · holder ◆ {t.claimed_by.name}</>}
        {left != null && <> · {left > 0 ? `expires ${when(t.lease_expires_at)} (${clock(left)} left)` : "lease expired: the next claim takes the task"}</>}
        {" · written by "}<Actor a={t.actor} kind={false} /> {when(t.created_at)}
      </div>
      <div className="dir"><span className="small">INSTRUCTIONS · directed text: the agents receive it. The writer keeps withheld values out of it.</span><br />{t.instructions || "—"}</div>
      <table className="ev">
        <thead><tr><th>input</th><th>record</th></tr></thead>
        <tbody>
          {t.inputs.map((r, i) => <tr key={i}><td>{r.kind}</td><td className="nm">{r.kind === "candidate" ? <a onClick={() => p.onSelect({ kind: "candidate", id: r.id })}>{inputsDetail[r.id] ?? short(r.id)}</a> : refLabel(r)}</td></tr>)}
          {t.inputs.length === 0 && <tr><td colSpan={2} className="none">No input.</td></tr>}
        </tbody>
      </table>
      <h3>Report</h3>
      {t.state === "queued" || t.state === "claimed" ? <div className="small">Outputs and report: none until the holder ends the task.</div> : (
        <>
          <div className="text">{t.summary ?? (t.text_withheld ? <WithheldMark what="text" /> : "—")}</div>
          {t.reason && <div className="small">reason: {t.reason}</div>}
          {t.outputs.length > 0 && <div className="small">outputs: {t.outputs.map((r, i) => <span key={i}>{r.kind === "candidate" ? <a onClick={() => p.onSelect({ kind: "candidate", id: r.id })}>{refLabel(r)}</a> : refLabel(r)}{" "}</span>)}</div>}
        </>
      )}
      {(t.state === "queued" || t.state === "claimed") && (
        <div className="btns">
          <button disabled={refused != null} title={refused ?? undefined} onClick={() => setCancel(!cancel)}>Cancel task…</button>
        </div>
      )}
      {cancel && (
        <div className="form">
          <Field label="reason" error={w.err("reason")}><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {w.message && <div className="error-inline">{w.message}</div>}
          <div className="btns"><button className="pri" disabled={w.busy || !reason.trim()} onClick={() => w.run(() => postJson(`/tasks/${t.id}/cancel`, { reason }), () => { setCancel(false); p.onChanged(); })}>Cancel the task</button></div>
        </div>
      )}
    </>
  );
}
