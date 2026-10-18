// The record vocabulary (frontend/DESIGN-DECISIONS.md, record marks). One meaning for each mark.
import type { Actor as ActorT, Candidate, Withheld as WithheldT } from "../api/records";
import { chipClass, GLYPH } from "./view";

/** A status on one axis. Monochrome: the border style and the text give the status. */
export function Chip({ status }: { status: string | null | undefined }) {
  return <span className={chipClass(status)}>{status ?? "—"}</span>;
}

export function Actor({ a, kind = true }: { a: ActorT; kind?: boolean }) {
  return <span className="actor" title={`${a.kind} ${a.name}`}>{GLYPH[a.kind]} {a.name}{kind && <i> {a.kind}</i>}</span>;
}

/** Evidence source: platform, or lab (an external proposal). An imported record also gets "imported". */
export function Tier({ c, short = false }: { c: Pick<Candidate, "tier" | "import_key">; short?: boolean }) {
  const title = (c.tier === "lab" ? "External proposal: evidence from code outside the platform." : "Evidence from worker methods.") + (c.import_key ? ` Imported: ${c.import_key}.` : "");
  return (
    <>
      <span className={`tier${c.tier === "lab" ? " lab" : ""}`} title={title}>{c.tier}{c.tier === "lab" ? " ↗" : ""}</span>
      {!short && c.import_key && <span className="tier lab" title={`import key ${c.import_key}`}>imported</span>}
    </>
  );
}

export function ModelJudgment() {
  return <span className="mj" title="A model judgment. Its scores are judgments, not measurements or probabilities.">model judgment</span>;
}

export function DisplayCalc({ rule }: { rule: string }) {
  return <span className="dc" title="Calculated for display. Not a stored result.">display calc · {rule}</span>;
}

export function WithheldMark({ what }: { what: WithheldT | string }) {
  return <span className="wh" title="Blinding withholds this value from the agents of the campaign.">{what === "text" ? "other writers' text" : what}</span>;
}
