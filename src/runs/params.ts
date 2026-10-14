import type { ParamSchema } from "../api/types";

/**
 * Parameter form logic for any method schema. The form shows every leaf of the schema.
 * The API checks the same rules again and is the final authority (422 responses).
 */

export type Path = string[];
export interface Field { path: Path; key: string; schema: ParamSchema; group: string | null; groupDescription?: string }

/** Leaf fields in schema order. A nested object becomes a group. */
export function fields(schema: ParamSchema, prefix: Path = [], group: string | null = null, groupDescription?: string): Field[] {
  const out: Field[] = [];
  for (const [name, s] of Object.entries(schema.properties ?? {})) {
    const path = [...prefix, name];
    if (s.type === "object" && s.properties) out.push(...fields(s, path, name, s.description));
    else out.push({ path, key: path.join("."), schema: s, group, groupDescription });
  }
  return out;
}

export function getAt(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function setAt<T extends Record<string, unknown>>(obj: T, path: Path, value: unknown): T {
  const [head, ...rest] = path;
  if (head === undefined) return obj;
  const child = (obj[head] ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: rest.length ? setAt(child, rest, value) : value };
}

/** Text in the form for a value. Arrays are comma-separated. */
export function toText(v: unknown): string {
  return Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
}

/** Parses form text into the schema type. Returns an error message for text that is not a valid value. */
export function parse(text: string, s: ParamSchema): { value: unknown } | { error: string } {
  const t = text.trim();
  if (s.enum) return s.enum.map(String).includes(t) ? { value: s.enum.find((e) => String(e) === t) } : { error: `use one of: ${s.enum.join(", ")}` };
  if (s.type === "array") {
    if (t === "") return { value: [] };
    const parts = t.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.some((x) => !Number.isFinite(x))) return { error: "use numbers separated by commas" };
    return { value: parts };
  }
  if (s.type === "integer" || s.type === "number") {
    if (t === "") return { error: "a value is required" };
    const x = Number(t);
    if (!Number.isFinite(x)) return { error: "use a number" };
    if (s.type === "integer" && !Number.isInteger(x)) return { error: "use a whole number" };
    return { value: x };
  }
  return { value: t };
}

/** Checks one value against its schema. Returns the messages, or an empty list. */
export function check(v: unknown, s: ParamSchema): string[] {
  const e: string[] = [];
  if (s.type === "array" && Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) e.push(`at least ${s.minItems} value${s.minItems > 1 ? "s" : ""}`);
    if (s.maxItems != null && v.length > s.maxItems) e.push(`at most ${s.maxItems} values`);
    if (s.uniqueItems && new Set(v).size !== v.length) e.push("values must be different");
    if (s.items) for (const x of v) for (const m of check(x, s.items)) if (!e.includes(`each ${m}`)) e.push(`each ${m}`);
    return e;
  }
  if (typeof v === "number") {
    if (s.minimum != null && v < s.minimum) e.push(`≥ ${s.minimum}`);
    if (s.maximum != null && v > s.maximum) e.push(`≤ ${s.maximum}`);
    if (s.exclusiveMinimum != null && v <= s.exclusiveMinimum) e.push(`> ${s.exclusiveMinimum}`);
    if (s.exclusiveMaximum != null && v >= s.exclusiveMaximum) e.push(`< ${s.exclusiveMaximum}`);
    if (s.not?.multipleOf != null && v % s.not.multipleOf === 0) e.push(s.not.multipleOf === 2 ? "must be odd" : `not a multiple of ${s.not.multipleOf}`);
    if (s.multipleOf != null && v % s.multipleOf !== 0) e.push(`a multiple of ${s.multipleOf}`);
  }
  return e;
}

/**
 * Evaluates the method's cross-field rules, for example "search.minimum_period < search.maximum_period"
 * or "max(search.duration_days) < search.minimum_period". A rule in another form is left to the API.
 * Returns the rules that fail, with the paths that they name.
 */
export function failedConstraints(rules: string[], params: Record<string, unknown>): { rule: string; paths: string[] }[] {
  const term = (t: string): { value: number | null; path: string } | null => {
    const m = /^(?:(max|min)\(([\w.]+)\)|([\w.]+))$/.exec(t.trim());
    if (!m) return null;
    const path = m[2] ?? m[3]!, v = getAt(params, path.split("."));
    if (m[1]) return { value: Array.isArray(v) && v.length ? (m[1] === "max" ? Math.max(...v) : Math.min(...v)) : null, path };
    return { value: typeof v === "number" ? v : null, path };
  };
  const out: { rule: string; paths: string[] }[] = [];
  for (const rule of rules) {
    const m = /^(.+?)\s*(<=|>=|<|>)\s*(.+)$/.exec(rule);
    if (!m) continue;
    const a = term(m[1]!), b = term(m[3]!);
    if (!a || !b || a.value == null || b.value == null) continue;
    const ok = m[2] === "<" ? a.value < b.value : m[2] === "<=" ? a.value <= b.value : m[2] === ">" ? a.value > b.value : a.value >= b.value;
    if (!ok) out.push({ rule, paths: [a.path, b.path] });
  }
  return out;
}

/**
 * Estimated number of trial periods of the BLS period grid for one light curve.
 * astropy BoxLeastSquares.autoperiod uses a uniform frequency grid with spacing
 * frequency_factor × min(duration) / baseline², from 1/maximum_period to 1/minimum_period.
 */
export function blsTrials(baselineDays: number, minPeriod: number, maxPeriod: number, durations: number[], frequencyFactor: number): number {
  if (!(baselineDays > 0 && minPeriod > 0 && maxPeriod > minPeriod && durations.length && frequencyFactor > 0)) return NaN;
  const df = (frequencyFactor * Math.min(...durations)) / (baselineDays * baselineDays);
  return Math.ceil((1 / minPeriod - 1 / maxPeriod) / df);
}
