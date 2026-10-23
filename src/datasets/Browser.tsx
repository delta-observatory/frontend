import { useEffect, useMemo, useState } from "react";
import { getJson } from "../api/client";
import type { Dataset, Observation, Page, RunSummary } from "../api/types";
import { entries, safeUrl, type Catalog, type Entry } from "./catalog";

type Tab = "observations" | "runs" | "experiments";
type Props = { indexed: Dataset[]; activeDataset: string | null; onObservation: (dataset: string, id: string) => void; onRun: (dataset: string, run: RunSummary) => void };

function Document({ collection, id }: { collection: "datasets" | "experiments"; id: string }) {
  const [open, setOpen] = useState(false), [text, setText] = useState<string | null>(null), [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || text !== null) return;
    const controller = new AbortController();
    getJson<{ text: string; sha256: string }>(`/catalog/documents/${collection}/${encodeURIComponent(id)}/README.md`, controller.signal)
      .then((r) => { setText(r.text); setHash(r.sha256); }, (e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [open, text, collection, id]);
  return <div className="dataset-document">
    <button aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide report" : "Read report"}</button>
    {open && (error ? <p className="bad">{error}</p> : text === null ? <p>Loading report…</p> : <>
      <p className="small">Source: {collection}/{id}/README.md · SHA-256 <code>{hash}</code></p>
      <pre>{text}</pre>
    </>)}
  </div>;
}

function Observations({ entry, onOpen }: { entry: Entry; onOpen: Props["onObservation"] }) {
  const [page, setPage] = useState<Page<Observation> | null>(null), [offset, setOffset] = useState(0), [state, setState] = useState("");
  const [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!entry.indexed) return;
    const controller = new AbortController(); setPage(null); setError(null);
    const params = new URLSearchParams({ dataset_id: entry.id, limit: "50", offset: String(offset) });
    if (state) params.set("state", state);
    getJson<Page<Observation>>(`/observations?${params}`, controller.signal).then(setPage, (e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [entry.id, entry.indexed, offset, state, revision]);
  if (!entry.indexed) return <p className="dataset-empty">The application has no indexed observations for this dataset. Catalog documentation does not establish local file availability.</p>;
  return <>
    <div className="dataset-toolbar"><label>Observation state <select value={state} onChange={(e) => { setOffset(0); setState(e.target.value); }}>
      <option value="">All states</option>{Object.keys(entry.indexed.observation_counts).sort().map((s) => <option key={s}>{s}</option>)}
    </select></label><button onClick={() => setRevision(revision + 1)}>Refresh observations</button>
      <span>{page ? `${page.total} observations` : "Loading observations…"}</span></div>
    {error ? <p className="bad">{error}</p> : page && <>
      {page.items.length === 0 ? <p>No observations match this state.</p> : <div className="dataset-table-scroll"><table><thead><tr>
        <th>Target</th><th>Sector</th><th>Cadence · s</th><th>Rows</th><th>State</th><th>Action</th>
      </tr></thead><tbody>{page.items.map((o) => <tr key={o.id}>
        <td title={o.id}>{o.target_id ?? "Identity withheld"}</td><td>{o.sector ?? "—"}</td><td>{o.cadence_seconds ?? "—"}</td>
        <td>{o.row_count?.toLocaleString() ?? "—"}</td><td>{o.state}</td>
        <td><button disabled={o.state !== "ready"} onClick={() => onOpen(entry.id, o.id)}>Inspect</button></td>
      </tr>)}</tbody></table></div>}
      <div className="dataset-pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
        <span>{page.total ? `${offset + 1}–${offset + page.items.length} of ${page.total}` : "0 observations"}</span>
        <button disabled={offset + page.items.length >= page.total} onClick={() => setOffset(offset + 50)}>Next</button></div>
    </>}
  </>;
}

function Runs({ entry, onOpen }: { entry: Entry; onOpen: Props["onRun"] }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!entry.indexed) return;
    const controller = new AbortController(); setRuns(null); setError(null);
    getJson<RunSummary[]>(`/runs?${new URLSearchParams({ dataset_id: entry.id, limit: "51", offset: String(offset) })}`, controller.signal)
      .then(setRuns, (e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [entry.id, entry.indexed, offset]);
  if (!entry.indexed) return <p className="dataset-empty">The application has no indexed observations for runs in this dataset.</p>;
  return <><p className="small">These application runs use input observations from this dataset. Index jobs are excluded. A completed job does not establish scientific validity.</p>
    {error ? <p className="bad">{error}</p> : runs === null ? <p>Loading runs…</p> : <>
      {runs.length === 0 ? <p>No runs use visible input observations from this dataset.</p> : <div className="dataset-table-scroll"><table><thead><tr>
        <th>Run</th><th>Method</th><th>Created</th><th>Jobs</th><th>Action</th>
      </tr></thead><tbody>{runs.slice(0, 50).map((run) => <tr key={run.id}>
        <td title={run.id}>{run.label || run.id.slice(0, 8)}</td><td>{run.method_id} v{run.method_version}</td>
        <td>{new Date(run.created_at).toLocaleString()}</td><td>{Object.entries(run.job_states).map(([s, n]) => `${n} ${s}`).join(" · ") || "No jobs"}</td>
        <td><button onClick={() => onOpen(entry.id, run)}>Show results</button></td>
      </tr>)}</tbody></table></div>}
      <div className="dataset-pagination"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
        <span>{runs.length ? `Runs ${offset + 1}–${offset + Math.min(50, runs.length)}` : "0 runs"}</span>
        <button disabled={runs.length <= 50} onClick={() => setOffset(offset + 50)}>Next</button></div>
    </>}
  </>;
}

export function DatasetBrowser({ indexed, activeDataset, onObservation, onRun }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null), [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(activeDataset), [tab, setTab] = useState<Tab>("observations");
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  useEffect(() => {
    const controller = new AbortController(); setError(null);
    getJson<Catalog>("/catalog", controller.signal).then(setCatalog, (e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [revision]);
  const all = useMemo(() => entries(catalog, indexed), [catalog, indexed]);
  const visible = useMemo(() => all.filter((e) => {
    const text = `${e.id} ${e.description?.name ?? ""} ${e.description?.category ?? ""} ${e.description?.description ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase().trim()) && (filter === "all" || (filter === "indexed" ? !!e.indexed : e.experiments.length > 0));
  }), [all, query, filter]);
  const entry = visible.find((e) => e.id === selected) ?? visible[0] ?? null;
  const experimentsAvailable = !!catalog?.experiments.available;
  return <section className="dataset-browser" aria-label="Dataset browser">
    <aside className="dataset-list">
      <header><strong>DATASETS</strong><span>{visible.length} / {all.length}</span></header>
      <label className="dataset-search">Search datasets<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, category, description" /></label>
      <select aria-label="Dataset filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">All datasets</option><option value="indexed">Indexed in application</option><option value="experiments">With registered experiments</option>
      </select>
      <div className="dataset-options">{visible.map((e) => <button key={e.id} className={entry?.id === e.id ? "on" : ""} onClick={() => setSelected(e.id)}>
        <strong>{e.description?.name ?? e.id}</strong><span>{e.id}</span>
        <small>{e.indexed ? `${Object.values(e.indexed.observation_counts).reduce((a, b) => a + b, 0)} indexed` : "Catalog only"}
          {experimentsAvailable && ` · ${e.experiments.length} ${e.experiments.length === 1 ? "experiment" : "experiments"}`}</small>
      </button>)}</div>
      {!visible.length && <p>No datasets match.</p>}
      <footer><button onClick={() => setRevision(revision + 1)}>Refresh catalog</button></footer>
    </aside>
    <div className="dataset-detail">
      {error && <p className="dataset-notice">Catalog access is unavailable. Indexed datasets remain visible. {error}</p>}
      {!catalog && !error && <p>Loading catalog documentation…</p>}
      {catalog && [...catalog.datasets.issues, ...catalog.experiments.issues].length > 0 && <details className="dataset-notice"><summary>Catalog source issues</summary>
        {[...catalog.datasets.issues, ...catalog.experiments.issues].map((issue, i) => <p key={i}>{issue}</p>)}
      </details>}
      {entry ? <>
        <header className="dataset-heading"><div><span className="small">{entry.description?.category ?? "Application dataset"} · {entry.id}</span>
          <h2>{entry.description?.name ?? entry.id}</h2><p>{entry.description?.description ?? "Catalog documentation is unavailable for this dataset."}</p></div>
          <span className="dataset-badge">{entry.indexed ? `Index: ${entry.indexed.state}` : "Catalog only"}</span></header>
        <div className="dataset-facts">
          <div><b>Application index</b><p>{entry.indexed ? Object.entries(entry.indexed.observation_counts).map(([s, n]) => `${n} ${s}`).join(" · ") || "No observations" : "No indexed observations"}</p>
            {entry.indexed?.last_indexed_at && <span className="small">Last index: {new Date(entry.indexed.last_indexed_at).toLocaleString()}</span>}</div>
          <div><b>Catalog acquisition scope</b><p>{entry.description?.acquisition?.scope ?? "No acquisition scope is available."}</p>
            <span className="small">Documentation review: {entry.description?.documentation_reviewed_on ?? "unavailable"}. This scope is not a live inventory.</span></div>
        </div>
        <details className="dataset-metadata"><summary>Dataset description and source</summary>
          <p>{entry.description?.grain} {entry.description?.coverage}</p>
          <p>Bands: {entry.description?.bands?.join(", ") || "—"} · Formats: {entry.description?.formats?.join(", ") || "—"}</p>
          {safeUrl(entry.description?.access?.url) && <p><a href={safeUrl(entry.description?.access?.url)} target="_blank" rel="noreferrer">{entry.description?.access.provider || "Archive source"}</a></p>}
          {entry.description && <><p className="small">Metadata SHA-256: <code>{entry.description.metadata_sha256}</code></p><Document key={entry.id} collection="datasets" id={entry.id} /></>}
        </details>
        <nav className="dataset-tabs" aria-label="Dataset sections">{(["observations", "runs", "experiments"] as Tab[]).map((t) => <button key={t} className={tab === t ? "on" : ""} aria-pressed={tab === t} onClick={() => setTab(t)}>
          {t[0]!.toUpperCase() + t.slice(1)}{t === "experiments" && experimentsAvailable ? ` (${entry.experiments.length})` : ""}
        </button>)}</nav>
        <div className="dataset-content">
          {tab === "observations" && <Observations key={entry.id} entry={entry} onOpen={onObservation} />}
          {tab === "runs" && <Runs key={entry.id} entry={entry} onOpen={onRun} />}
          {tab === "experiments" && <>
            <p className="small">Links come from registered experiment manifests. The source index supplies each status and result. Closure does not establish survey-wide validity.</p>
            {!experimentsAvailable ? <p>Experiment records are unavailable. Their count is unknown.</p> : !entry.experiments.length ? <p>No registered experiment references this dataset in the available index.</p> : entry.experiments.map((exp) => <article className="dataset-experiment" key={exp.id}>
              <h3>{exp.title}</h3><p className="dataset-status">{exp.status}</p><p>{exp.result}</p>
              <p className="small">Dataset role: {exp.datasets.filter((d) => d.dataset_id === entry.id).map((d) => d.role ?? "Unspecified").join(", ")}</p>
              {exp.methods.map((m, i) => <p key={i}><code>{m.method_id}</code> · {m.scope ?? "No method scope supplied."}</p>)}
              <Document collection="experiments" id={exp.id} />
              <details className="small"><summary>Manifest source</summary><p>{exp.id}/experiment.json</p><code>{exp.manifest_sha256}</code></details>
            </article>)}
          </>}
        </div>
      </> : <p className="dataset-empty">No dataset records are available.</p>}
    </div>
  </section>;
}
