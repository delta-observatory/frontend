import type { Target } from "./catalogue";

/** Class buttons over the observation table. */
export type ClassFilter = "all" | "planet_host" | "no_known_planet" | "eclipsing_binary";

/** Numeric fields that the search accepts, for example snr>20 or sector:2. */
const FIELDS: Record<string, (t: Target) => number | null> = {
  snr: (t) => t.snr,
  err: (t) => t.relErr,
  p: (t) => t.period,
  pref: (t) => t.refPeriod,
  tmag: (t) => t.tmag,
  sector: (t) => t.sector,
};

export interface Search {
  test: (t: Target) => boolean;
  errors: string[];
}

/** A decimal number, for example 20, -1.5, .5, or 1e-3. The API accepts the same forms. */
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Parses a search text in the API grammar target-query/1 (GET /api/rules describes it).
 * The API applies the same grammar in GET /api/targets?q=. This copy filters while the user types.
 * vendor/api-vectors/target_query.json holds the cases that both implementations pass.
 * Tokens separated by spaces must all match.
 * A token "field>value", "field<value", "field=value", or "field:value" compares a number.
 * Any other token matches part of the name or the TIC identifier, without regard to case.
 * A target without a value for a field does not match a comparison on that field.
 */
export function parseSearch(text: string, cls: ClassFilter = "all"): Search {
  const errors: string[] = [];
  const tests: ((t: Target) => boolean)[] = [];
  if (cls !== "all") tests.push((t) => t.cls === cls);
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    const m = /^([a-z]+)([<>=:])(.*)$/i.exec(token);
    if (m) {
      const get = FIELDS[m[1]!.toLowerCase()], value = NUMBER.test(m[3]!) ? Number(m[3]) : NaN;
      if (!get) { errors.push(`unknown field "${m[1]}". Fields: ${Object.keys(FIELDS).join(", ")}`); continue; }
      if (!Number.isFinite(value)) { errors.push(`"${token}" needs a number`); continue; }
      const op = m[2];
      tests.push((t) => {
        const v = get(t);
        if (v == null) return false;
        return op === ">" ? v > value : op === "<" ? v < value : v === value;
      });
    } else {
      const needle = token.toLowerCase();
      tests.push((t) => `${t.name ?? ""} ${t.tic}`.toLowerCase().includes(needle));
    }
  }
  return { test: (t) => tests.every((f) => f(t)), errors };
}
