// Display helpers for a run comparison (rule run-comparison/1). The API gives each difference.
// These helpers only sort, filter, and format. They calculate no stored value.
import type { CompareRow, ComparedMeasurement, Difference } from "../api/records";

export type RowFilter = "all" | "both" | "only_a" | "only_b" | "state_differs";

export function category(r: CompareRow): "both" | "only_a" | "only_b" {
  return r.a && r.b ? "both" : r.a ? "only_a" : "only_b";
}

export function filterRows(rows: CompareRow[], f: RowFilter): CompareRow[] {
  if (f === "all") return rows;
  if (f === "state_differs") return rows.filter((r) => r.a && r.b && r.a.state !== r.b.state);
  return rows.filter((r) => category(r) === f);
}

export const measured = (r: CompareRow, side: "a" | "b", name: string): ComparedMeasurement | null => r[side]?.measurements.search?.[name] ?? null;
export const diffOf = (r: CompareRow, name: string): Difference | null => r.differences.search?.[name] ?? null;

/** Rows with the largest |Δ| first. Rows without a difference keep the API order after them. */
export function sortByAbsDelta(rows: CompareRow[], name: string): CompareRow[] {
  return rows.map((r, i) => ({ r, i, d: diffOf(r, name) })).sort((x, y) => {
    if (x.d && y.d) return Math.abs(y.d.value) - Math.abs(x.d.value) || x.i - y.i;
    if (x.d) return -1;
    if (y.d) return 1;
    return x.i - y.i;
  }).map((x) => x.r);
}

/** A difference with its sign and enough digits to show a change of the stored values. */
export function formatDelta(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v), s = v > 0 ? "+" : "−";
  if (a >= 1e5 || a < 1e-4) return s + a.toExponential(2);
  return s + a.toPrecision(4).replace(/\.?0+$/, "");
}

/** A stored value for a comparison cell. */
export function formatValue(v: number | null | undefined, digits = 7): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 1e6) return v.toFixed(0);
  if (a >= 1e5 || (a < 1e-3 && a !== 0)) return v.toExponential(3);
  return v.toPrecision(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** The parameter value of a difference, as compact text. */
export function paramText(v: unknown): string {
  if (v === undefined) return "absent";
  if (Array.isArray(v)) return v.length > 4 ? `${v[0]} … ${v[v.length - 1]} (${v.length})` : v.join(", ");
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}
