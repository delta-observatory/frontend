import { Fragment } from "react";
import type { Measurement, MethodInfo, ObservationDetail, RunSummary } from "./api/types";
import type { Target } from "./data/catalogue";
import type { Evidence } from "./data/evidence";

const CLASS = { planet_host: "planet host", no_known_planet: "no known planet", eclipsing_binary: "eclipsing binary" };
const LABEL: Record<string, string> = {
  period: "period", transit_time: "transit time", duration: "duration", depth: "depth", depth_snr: "depth S/N", log_likelihood: "log likelihood",
  depth_odd: "depth, odd", depth_even: "depth, even", harmonic_delta_log_likelihood: "harmonic Δ log L", observed_transit_count: "transits observed",
  relative_period_error: "rel. period error", relative_half_period_error: "rel. error vs P/2", relative_double_period_error: "rel. error vs 2P", phase_error: "phase error",
};
// Short labels for quality flags. The full flag name shows on hover.
const FLAG: Record<string, string> = { trend_removal_can_reduce_depth: "DETREND", guided_comparison: "GUIDED" };

/** Formats a value with its standard uncertainty to two significant digits of the uncertainty. */
export function formatMeasurement(m: Measurement): { value: string; unc: string; reason: string | null } {
  if (m.uncertainty.kind === "standard" && m.uncertainty.value > 0) {
    const d = Math.min(12, Math.max(0, 1 - Math.floor(Math.log10(m.uncertainty.value))));
    return { value: m.value.toFixed(d), unc: `± ${m.uncertainty.value.toFixed(d)}`, reason: null };
  }
  const a = Math.abs(m.value);
  const value = Number.isInteger(m.value) && a < 1e6 ? m.value.toFixed(0)
    : a >= 1e7 || (a < 1e-3 && a !== 0) ? m.value.toExponential(4)
    : a >= 1 ? m.value.toFixed(Math.max(2, 7 - Math.floor(Math.log10(a)))) : m.value.toPrecision(7);
  return { value, unc: "—", reason: m.uncertainty.kind === "unavailable" ? m.uncertainty.reason : null };
}

function Measurements({ list }: { list: Measurement[] }) {
  return (
    <table>
      <thead><tr><th>quantity</th><th className="n">value</th><th className="n">uncertainty</th><th>unit</th><th>flags</th></tr></thead>
      <tbody>
        {list.map((m) => {
          const f = formatMeasurement(m), unit = m.unit + (m.time_scale ? ` ${m.time_scale.toUpperCase()}` : "");
          return (
            <tr key={m.name} title={[f.reason, m.time_reference && `time reference ${m.time_reference}`].filter(Boolean).join(" · ")}>
              <td className="k">{LABEL[m.name] ?? m.name.replace(/_/g, " ")}</td>
              <td className="n">{f.value}</td>
              <td className={`n${f.reason ? " na" : ""}`}>{f.unc}</td>
              <td className="unit">{unit}</td>
              <td>{m.quality_flags.map((q) => <span key={q} className="flag" title={q}>{FLAG[q] ?? q}</span>)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface Props {
  target: Target; observation: ObservationDetail | null; ev: Evidence | null; method: MethodInfo | null; run: RunSummary | null;
  loading: boolean; error: string | null; changeMs: number | null;
  /** Opens the new-candidate form for this result. */
  onNewCandidate?: () => void;
}

/** Values, measurements, checks, and provenance of the selected target. */
export function Inspector({ target: t, observation, ev, method, run, loading, error, changeMs, onNewCandidate }: Props) {
  const f = (x: number | null | undefined, d: number) => (x == null ? "—" : x.toFixed(d));
  const h = observation?.header ?? ev?.observation.header ?? {};
  const num = (k: string) => (typeof h[k] === "number" ? (h[k] as number) : null);
  const search = ev?.job.measurements.search ?? [], ref = ev?.job.measurements.reference_comparison ?? [];
  const sw = ev?.job.software, res = ev?.job.resources;
  return (
    <div className="scroll"><div className="ibody">
      {method && <div className="prov"><b className="id">{method.id} v{method.version}</b> · {method.scientific_status}</div>}
      <h3>Target</h3>
      <div className="kv">
        <span>label</span><span>{t.cls ? CLASS[t.cls] : "withheld"}{t.name ? ` · ${t.name}` : ""}</span>
        <span>RA, Dec (deg)</span><span>{f(t.ra, 5)}, {f(t.dec, 5)}</span>
        <span>sector · camera · CCD</span><span>{t.sector} · {num("CAMERA") ?? "—"} · {num("CCD") ?? "—"}</span>
        <span>T mag</span><span>{f(t.tmag, 3)}</span>
        <span>Teff (K) · R* (Rsun)</span><span>{f(num("TEFF"), 0)} · {f(num("RADIUS"), 3)}</span>
        <span>CROWDSAP · FLFRCSAP</span><span>{f(num("CROWDSAP"), 4)} · {f(num("FLFRCSAP"), 4)}</span>
      </div>
      {loading && <div className="empty">Loading the result artifacts…</div>}
      {error && <div className="error-inline">{error}</div>}
      {ev && (
        <>
          <h3>Search · role search</h3>
          <Measurements list={search} />
          {onNewCandidate && <div className="btns"><button onClick={onNewCandidate}>New candidate from this result…</button></div>}
          <h3>Reference comparison · guided</h3>
          {ev.planet && ref.length ? (
            <>
              <Measurements list={ref} />
              <div className="kv">
                <span>reference</span><span>{ev.planet.name}</span>
                <span>P ref (d)</span><span>{ev.planet.period_days} ± {ev.planet.period_err_days ?? "—"}</span>
                <span>midpoint (BTJD, TDB)</span><span>{ev.planet.transit_midpoint_btjd_tdb} ± {ev.planet.transit_midpoint_err_days ?? "—"}</span>
              </div>
            </>
          ) : <div className="kv"><span>status</span><span>no known planet in the labels</span></div>}
          <h3>Input checks</h3>
          <div className="kv">
            <span>flux column</span><span>{ev.checks.flux_column}</span>
            <span>rows kept / total</span><span>{ev.checks.retained} / {ev.checks.rows}</span>
            <span>baseline (d)</span><span>{ev.checks.baseline_days.toFixed(3)}</span>
            {Object.entries(ev.checks.exclusion_reasons_overlapping).map(([k, v]) => <Fragment key={k}><span>excluded, {k.replace(/_/g, " ")}</span><span>{v}</span></Fragment>)}
            <span>QUALITY values</span><span>{Object.entries(ev.checks.quality_values).map(([k, v]) => `${k}: ${v}`).join("  ")}</span>
          </div>
          <h3>Provenance</h3>
          <div className="kv">
            <span>run</span><span>{run?.id.slice(0, 8) ?? "—"} · {run?.label ?? ""}</span>
            <span>parameters SHA-256</span><span>{run ? `${run.parameters_sha256.slice(0, 16)}…` : "—"}</span>
            <span>grid trials · P range (d)</span><span>{ev.summary.grid_trials.toLocaleString("en-US")} · {ev.summary.grid_period_min_days.toFixed(3)}–{ev.summary.grid_period_max_days.toFixed(3)}</span>
            <span>worker</span><span>{sw?.worker_version ?? "—"}</span>
            <span>lightkurve · astropy</span><span>{sw?.packages?.lightkurve ?? "—"} · {sw?.packages?.astropy ?? "—"}</span>
            <span>job time · peak memory</span><span>{f(res?.elapsed_seconds, 1)} s · {f(res?.peak_rss_mib, 0)} MiB</span>
            <span>SPOC</span><span>{ev.checks.procver ?? "—"}</span>
          </div>
          <h3>Load</h3>
          <div className="kv">
            <span>artifacts</span><span>{(ev.timing.bytes / 1e6).toFixed(2)} MB compressed</span>
            <span>fetch · parse</span><span>{ev.timing.fetchMs.toFixed(0)} ms · {ev.timing.parseMs.toFixed(0)} ms</span>
            <span>target change to plots</span><span>{changeMs == null ? "—" : `${changeMs.toFixed(0)} ms`}</span>
          </div>
        </>
      )}
    </div></div>
  );
}
