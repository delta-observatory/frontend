import { useEffect, useRef, type RefObject } from "react";
import { statusOf, type Target } from "./data/catalogue";
import type { ClassFilter } from "./data/search";

const CLASS = { planet_host: "host", no_known_planet: "none", eclipsing_binary: "EB" };
const BUTTONS: [ClassFilter, string][] = [["all", "all"], ["planet_host", "hosts"], ["no_known_planet", "none"], ["eclipsing_binary", "EB"]];

interface Props {
  rows: Target[];
  total: number;
  hover: string | null;
  selected: string | null;
  query: string;
  cls: ClassFilter;
  errors: string[];
  input: RefObject<HTMLInputElement | null>;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onQuery: (q: string) => void;
  onClass: (c: ClassFilter) => void;
}

/** Observation table over the sky, sorted by depth S/N. It lists only the targets that match the search. */
export function Catalogue({ rows, total, hover, selected, query, cls, errors, input, onHover, onSelect, onQuery, onClass }: Props) {
  const body = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    body.current?.querySelector("tr.sel")?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <section className="panel catalogue">
      <header><span>Observations · <b>{rows.length}</b>{rows.length !== total && ` of ${total}`}</span><span>sort: depth S/N ↓</span></header>
      <div className="filter">
        <input ref={input} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="/  wasp  snr>20  err<0.01  p<2  sector:2" spellCheck={false} />
        {BUTTONS.map(([c, label]) => <button key={c} className={c === cls ? "on" : ""} onClick={() => onClass(c)}>{label}</button>)}
      </div>
      {errors.length > 0 && <div className="filter-errors">{errors.join(" · ")}</div>}
      <div className="scroll">
        <table>
          <thead>
            <tr><th /><th>TIC</th><th>name</th><th className="c-cls">class</th><th className="n c-s">S</th><th className="n c-tmag">Tmag</th><th className="n">P ref</th><th className="n">P bls</th><th className="n">S/N</th><th className="n c-err">|ΔP/P|</th></tr>
          </thead>
          <tbody ref={body} onMouseLeave={() => onHover(null)}>
            {rows.map((t) => (
              <tr key={t.id} className={`st-${statusOf(t)}${t.id === selected ? " sel" : t.id === hover ? " hov" : ""}`} onMouseEnter={() => onHover(t.id)} onClick={() => onSelect(t.id)}>
                <td><i className={`mk mk-${t.cls ?? "planet_host"}`} /></td>
                <td>{t.tic.replace("TIC:", "")}</td>
                <td className="nm">{t.name ?? "—"}</td>
                <td className="c-cls">{t.cls ? CLASS[t.cls] : "—"}</td>
                <td className="n c-s">{String(t.sector).padStart(2, "0")}</td>
                <td className="n c-tmag">{t.tmag?.toFixed(2) ?? "—"}</td>
                <td className="n">{t.refPeriod?.toFixed(4) ?? "—"}</td>
                <td className="n">{t.period?.toFixed(4) ?? "—"}</td>
                <td className="n">{t.snr?.toFixed(0) ?? "—"}</td>
                <td className="n c-err">{t.relErr != null ? t.relErr.toExponential(1) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="none">No observation matches the search.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
