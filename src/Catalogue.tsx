import { displayStatus, type Target } from "./data/catalogue";

const CLASS = { planet_host: "host", no_known_planet: "none", eclipsing_binary: "EB" };

/** Observation table over the sky. Sorted by depth S/N. Hover links a row to its sky marker. */
export function Catalogue({ targets, hover, onHover }: { targets: Target[]; hover: string | null; onHover: (id: string | null) => void }) {
  const rows = [...targets].sort((a, b) => (b.snr ?? -1) - (a.snr ?? -1));
  return (
    <section className="panel catalogue">
      <header><span>Observations · <b>{targets.length}</b></span><span>sort: depth S/N ↓</span></header>
      <div className="scroll">
        <table>
          <thead>
            <tr><th /><th>TIC</th><th>name</th><th>class</th><th className="n">S</th><th className="n">Tmag</th><th className="n">P ref</th><th className="n">P bls</th><th className="n">S/N</th><th className="n">|ΔP/P|</th></tr>
          </thead>
          <tbody onMouseLeave={() => onHover(null)}>
            {rows.map((t) => (
              <tr key={t.id} className={`st-${displayStatus(t)}${t.id === hover ? " hov" : ""}`} onMouseEnter={() => onHover(t.id)}>
                <td><i className={`mk mk-${t.cls}`} /></td>
                <td>{t.tic.replace("TIC:", "")}</td>
                <td className="nm">{t.name ?? "—"}</td>
                <td>{CLASS[t.cls]}</td>
                <td className="n">{String(t.sector).padStart(2, "0")}</td>
                <td className="n">{t.tmag?.toFixed(2) ?? "—"}</td>
                <td className="n">{t.refPeriod?.toFixed(4) ?? "—"}</td>
                <td className="n">{t.period?.toFixed(4) ?? "—"}</td>
                <td className="n">{t.snr?.toFixed(0) ?? "—"}</td>
                <td className="n">{t.relErr != null ? t.relErr.toExponential(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
