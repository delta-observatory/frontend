import { useEffect, useMemo, useState } from "react";
import { records, type Comparison, type CompareRow } from "../api/records";
import type { RunDetail, RunSummary } from "../api/types";
import type { Target } from "../data/catalogue";
import type { Evidence } from "../data/evidence";
import { DisplayCalc } from "../records/marks";
import { short } from "../records/view";
import { fetchRunDetail } from "../runs/useRuns";
import { diffOf, filterRows, formatDelta, formatValue, measured, paramText, sortByAbsDelta, type RowFilter } from "./compare";

/** Loads the comparison of two runs (rule run-comparison/1). */
export function useComparison(a: string | null, b: string | null, key: string): { data: Comparison | null; error: string | null } {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    if (!a || !b) { setData(null); return; }
    let live = true;
    records.compare(a, b).then((r) => { if (live) setData(r); }, (e: Error) => { if (live) { setData(null); setError(e.message); } });
    return () => { live = false; };
  }, [a, b, key]);
  return { data, error };
}

const FLAG: Record<string, string> = { trend_removal_can_reduce_depth: "DETREND", guided_comparison: "GUIDED" };
const FILTERS: [RowFilter, string][] = [["all", "all"], ["both", "in both"], ["only_a", "only A"], ["only_b", "only B"], ["state_differs", "state differs"]];
const SORTS: [string, string][] = [["api", "API order"], ["period", "|ΔP| first"], ["depth", "|Δdepth| first"], ["depth_snr", "|ΔS/N| first"]];

interface Props {
  /** Analysis runs that the client sees. */
  runs: RunSummary[];
  a: string | null;
  b: string | null;
  data: Comparison | null;
  error: string | null;
  targetsById: Map<string, Target>;
  selected: string | null;
  compact?: boolean;
  onPick: (side: "a" | "b", id: string) => void;
  onSelect: (observationId: string) => void;
}

function RunPick({ side, runs, value, other, onPick }: { side: "a" | "b"; runs: RunSummary[]; value: string | null; other: string | null; onPick: (id: string) => void }) {
  const run = runs.find((r) => r.id === value);
  return (
    <div className="cmp-run">
      <span className={`ab${side === "b" ? " b" : ""}`}>{side.toUpperCase()}</span>
      <select value={value ?? ""} onChange={(e) => onPick(e.target.value)} aria-label={`Run ${side.toUpperCase()}`}>
        {!value && <option value="">Choose a run</option>}
        {runs.map((r) => <option key={r.id} value={r.id} disabled={r.id === other}>{r.label ?? (r.text_withheld ? "label withheld" : "No label")} · {short(r.id)}</option>)}
      </select>
      {run && <span className="s">{run.method_id} v{run.method_version} · {run.job_states.complete ?? 0}/{run.input_count} complete</span>}
    </div>
  );
}

/** The ANALYSIS workspace table: the stored values of two runs side by side, and the API's differences. */
export function ComparePanel(p: Props) {
  const [filter, setFilter] = useState<RowFilter>("all");
  const [sort, setSort] = useState("api");
  const rows = useMemo(() => {
    const f = filterRows(p.data?.rows ?? [], filter);
    return sort === "api" ? f : sortByAbsDelta(f, sort);
  }, [p.data, filter, sort]);
  const d = p.data;
  const name = (r: CompareRow) => p.targetsById.get(r.observation_id)?.name ?? "—";
  const cell = (r: CompareRow, side: "a" | "b", n: string, unc = false) => {
    const m = measured(r, side, n);
    if (!r[side]) return <td className="n dim">{side === "a" ? "not in A" : "not in B"}</td>;
    if (!m) return <td className="n dim">—</td>;
    return <td className="n" title={m.uncertainty.kind === "unavailable" ? m.uncertainty.reason : undefined}>{formatValue(m.value)}{unc && m.uncertainty.kind === "standard" ? ` ± ${formatValue(m.uncertainty.value, 2)}` : ""}</td>;
  };
  const delta = (r: CompareRow, n: string) => { const x = diffOf(r, n); return <td className={`n${x ? " dl" : " dim"}`} title={x?.uncertainty.kind === "unavailable" ? x.uncertainty.reason : undefined}>{x ? formatDelta(x.value) : "—"}</td>; };
  const state = (r: CompareRow, side: "a" | "b") => { const s = r[side]; return s ? <td className={side === "a" ? "g" : ""} title={s.error ? `${s.error.kind ?? ""} ${s.error.message ?? ""}` : undefined}>{s.state}</td> : <td className={`dim${side === "a" ? " g" : ""}`}>{side === "a" ? "not in A" : "not in B"}</td>; };
  return (
    <section className="cmp">
      <div className="cmp-pick">
        <RunPick side="a" runs={p.runs} value={p.a} other={p.b} onPick={(id) => p.onPick("a", id)} />
        <RunPick side="b" runs={p.runs} value={p.b} other={p.a} onPick={(id) => p.onPick("b", id)} />
      </div>
      {p.error && <div className="error-inline">{p.error}</div>}
      {d && (
        <div className="cmp-strip">
          <span>PARAMETERS · {d.parameters_equal ? "equal" : `${d.parameter_differences.length} differ${d.parameter_differences.length === 1 ? "s" : ""}`}</span>
          {d.parameter_differences.slice(0, 4).map((x) => <span key={x.path}><b>{x.path}</b> A {paramText(x.a)} → B {paramText(x.b)}</span>)}
          <span className="cmp-counts">in both <b>{d.summary.in_both}</b> · only A <b>{d.summary.only_a}</b> · only B <b>{d.summary.only_b}</b> · state differs <b>{d.summary.state_differs}</b>{d.protected_excluded ? <> · protected left out <b>{d.protected_excluded}</b></> : null}</span>
          <DisplayCalc rule={`Δ = B − A · ${d.rule}`} />
        </div>
      )}
      {d && (
        <div className="filter cmp-filter">
          {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <span className="small">{rows.length} rows</span>
        </div>
      )}
      <div className="scroll cmp-body">
        {!p.a || !p.b ? <div className="empty">Choose run A and run B. Both runs must use one method.</div> : !d ? (!p.error && <div className="empty">Loading the comparison…</div>) : (
          <table>
            <thead>
              <tr><th>target</th><th>name</th><th className="g">state A</th><th>state B</th>
                <th className="g n">P A (d)</th><th className="n">P B (d)</th><th className="n">ΔP (d)</th>
                {!p.compact && <><th className="g n">depth A</th><th className="n">depth B</th><th className="n">Δdepth</th><th>flags</th></>}
                <th className="g n">S/N A</th><th className="n">S/N B</th>{!p.compact && <th className="n">ΔS/N</th>}</tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const flags = new Set([...(measured(r, "a", "depth")?.quality_flags ?? []), ...(measured(r, "b", "depth")?.quality_flags ?? [])]);
                return (
                  <tr key={r.observation_id} className={r.observation_id === p.selected ? "sel" : ""} onClick={() => p.onSelect(r.observation_id)}>
                    <td>{r.target_id?.replace("TIC:", "") ?? <span className="wh">withheld</span>}</td><td className="nm">{name(r)}</td>
                    {state(r, "a")}{state(r, "b")}
                    {cell(r, "a", "period")}{cell(r, "b", "period")}{delta(r, "period")}
                    {!p.compact && <>{cell(r, "a", "depth", true)}{cell(r, "b", "depth", true)}{delta(r, "depth")}
                      <td>{[...flags].map((q) => <span key={q} className="flag" title={q}>{FLAG[q] ?? q}</span>)}</td></>}
                    {cell(r, "a", "depth_snr")}{cell(r, "b", "depth_snr")}{!p.compact && delta(r, "depth_snr")}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {d && <div className="small cmp-note">Δ has no uncertainty: both values come from the same observations, so their errors are correlated. A row of a run that this client cannot read is left out and counted.</div>}
      </div>
    </section>
  );
}

/** The Compare tab of the right column: all parameters of A and B, and the software of the selected target's jobs. */
export function CompareSide({ a, b, evA, evB, target, onSwap, onShowA, onExport }: {
  a: string | null; b: string | null; evA: Evidence | null; evB: Evidence | null; target: Target | null;
  onSwap: () => void; onShowA: () => void; onExport: (id: string) => void;
}) {
  const [ra, setRa] = useState<RunDetail | null>(null), [rb, setRb] = useState<RunDetail | null>(null);
  useEffect(() => { if (a) fetchRunDetail(a).then(setRa, () => setRa(null)); else setRa(null); }, [a]);
  useEffect(() => { if (b) fetchRunDetail(b).then(setRb, () => setRb(null)); else setRb(null); }, [b]);
  const leaves = (o: unknown, path = ""): [string, unknown][] => o && typeof o === "object" && !Array.isArray(o)
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k)) : [[path, o]];
  const pa = new Map(ra ? leaves(ra.parameters) : []), pb = new Map(rb ? leaves(rb.parameters) : []);
  const keys = [...new Set([...pa.keys(), ...pb.keys()])].sort();
  const sw = (ev: Evidence | null) => ev?.job.software ? `worker ${ev.job.software.worker_version ?? "—"} · lightkurve ${ev.job.software.packages?.lightkurve ?? "—"} · astropy ${ev.job.software.packages?.astropy ?? "—"} · numpy ${ev.job.software.packages?.numpy ?? "—"}` : "—";
  return (
    <div className="scroll"><div className="ibody">
      <h3>Parameters · A and B</h3>
      {!ra || !rb ? <div className="empty">Choose two runs.</div> : (
        <table>
          <thead><tr><th>parameter</th><th className="n">A</th><th className="n">B</th></tr></thead>
          <tbody>{keys.map((k) => { const same = JSON.stringify(pa.get(k)) === JSON.stringify(pb.get(k)); return <tr key={k} className={same ? "" : "diff"}><td className="k">{k}</td><td className="n">{paramText(pa.get(k))}</td><td className="n">{paramText(pb.get(k))}</td></tr>; })}</tbody>
        </table>
      )}
      <h3>Software · {target?.name ?? target?.tic ?? "selected target"}</h3>
      <div className="small">A · {sw(evA)}</div>
      <div className="small">B · {sw(evB)}</div>
      <div className="btns">
        <button onClick={onSwap} disabled={!a || !b}>Swap A and B</button>
        <button onClick={onShowA} disabled={!a}>Show A on sky</button>
        <button onClick={() => a && onExport(a)} disabled={!a}>Export A…</button>
        <button onClick={() => b && onExport(b)} disabled={!b}>Export B…</button>
      </div>
    </div></div>
  );
}
