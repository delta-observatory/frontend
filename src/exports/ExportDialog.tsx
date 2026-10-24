import { useEffect, useRef, useState } from "react";
import { apiFetch, getJson, pool } from "../api/client";
import type { RunResults } from "../api/types";
import { getObservation } from "../data/catalogue";
import { checkExport, type ExportCheck } from "./zip";

export interface ExportSubject { kind: "run" | "candidate"; id: string; label: string }

interface Sizes { jobArtifacts: number; jobBytes: number; lightCurves: number; lightBytes: number; observations: number; measurements: number }

/** Artifact counts and stored bytes of a run export, from the API's artifact records. */
async function runSizes(id: string): Promise<Sizes> {
  const r = await getJson<RunResults>(`/runs/${id}/results`);
  const obs = [...new Set(r.jobs.map((j) => j.observation_id).filter(Boolean))];
  const lcs = await pool(obs, 6, async (o) => (await getObservation(o)).artifacts.filter((a) => a.kind === "light_curve"));
  const all = r.jobs.flatMap((j) => j.artifacts);
  return {
    jobArtifacts: all.length, jobBytes: all.reduce((s, a) => s + a.bytes, 0),
    lightCurves: lcs.flat().length, lightBytes: lcs.flat().reduce((s, a) => s + a.bytes, 0),
    observations: obs.length, measurements: r.jobs.reduce((s, j) => s + Object.values(j.measurements).reduce((n, l) => n + (l?.length ?? 0), 0), 0),
  };
}

const mb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e3).toFixed(1)} kB`);

interface Download { name: string; bytes: number; header: string | null; buf: Uint8Array }

/** Export of a run or a candidate (contract export/1): choice of artifact files, download, and a check of every file in the browser. */
export function ExportDialog({ subject, onClose }: { subject: ExportSubject; onClose: () => void }) {
  const [includeInputs,setIncludeInputs]=useState(false);
  const [portableResult,setPortableResult]=useState('');
  const [mode, setMode] = useState<"none" | "all">("none");
  const [sizes, setSizes] = useState<Sizes | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dl, setDl] = useState<Download | null>(null);
  const [check, setCheck] = useState<ExportCheck | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const url = useRef<string | null>(null);
  useEffect(() => {
    if (subject.kind === "run") runSizes(subject.id).then(setSizes, () => setSizes(null));
    return () => { if (url.current) URL.revokeObjectURL(url.current); };
  }, [subject]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = async () => {
    setBusy(true); setError(null); setCheck(null);
    try {
      const path = `/api/${subject.kind === "run" ? "runs" : "candidates"}/${subject.id}/export?artifacts=${mode}`;
      const res = await apiFetch(path);
      if (!res.ok) { let m = `${res.status} ${res.statusText}`; try { const b = await res.json(); m = typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail); } catch { /* not JSON */ } throw new Error(m); }
      const buf = new Uint8Array(await res.arrayBuffer());
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `delta-${subject.kind}-${subject.id}.zip`;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(new Blob([buf as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url.current; a.download = name; a.click();
      setDl({ name, bytes: buf.length, header: res.headers.get("X-Export-Manifest-SHA256"), buf });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!dl) return;
    setBusy(true); setProgress([0, 0]);
    try { setCheck(await checkExport(dl.buf, dl.header, (d, t) => setProgress([d, t]))); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setProgress(null); }
  };

  const s = sizes;
  return (
    <div className="dlg-back" onClick={onClose}>
      <div className="dlg" role="dialog" aria-label={`Export ${subject.kind}`} onClick={(e) => e.stopPropagation()}>
        <header><span>Export · <b>{subject.kind} {subject.label}</b></span><span>contract export/1</span></header>
        <label className="opt"><input type="radio" checked={mode === "none"} onChange={() => setMode("none")} />
          <span><b>Records only</b><span className="small">
            {subject.kind === "run" ? <>Run, parameters, method, software, {s ? `${s.observations} observations, ${s.measurements} measurements` : "observations, measurements"} with units, uncertainty, and flags, candidates and their history, and the SHA-256 of {s ? s.jobArtifacts + s.lightCurves : "each"} artifacts.</>
              : <>Candidate, resolved evidence, assessments, decisions, and notes with actors, the referenced runs and jobs with parameters and software, measurements, and the SHA-256 of each artifact.</>}
          </span></span></label>
        <label className="opt"><input type="radio" checked={mode === "all"} onChange={() => setMode("all")} />
          <span><b>Records and artifact files</b><span className="small">
            {s ? `Adds ${s.jobArtifacts + s.lightCurves} stored artifact files: ${mb(s.jobBytes + s.lightBytes)}, of which ${s.lightCurves} light curves ${mb(s.lightBytes)}. ` : "Adds the stored artifact files. "}
            The files keep their stored bytes, so each SHA-256 equals the stored SHA-256.</span></span></label>
        {subject.kind==='run'&&window.deltaDesktop&&<fieldset><legend>Portable reproduction package</legend><p>The package preserves evidence, plan records, parameters, software versions, and input checksums.</p><label className="opt"><input type="checkbox" checked={includeInputs} onChange={e=>setIncludeInputs(e.target.checked)}/>Include original observation files</label><p>Without observations, the receiving workspace must acquire or import the exact files.</p><button disabled={busy} onClick={async()=>{setBusy(true);setError(null);try{const result=await window.deltaDesktop!.settings<{path?:string}>('exportReproduction',{run_id:subject.id,include_inputs:includeInputs});setPortableResult(result.path?'Saved: '+result.path:'Export cancelled.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Save reproduction package</button>{portableResult&&<p>{portableResult}</p>}</fieldset>}
        <div className="res">
          {error && <div className="error-inline">{error}</div>}
          {dl ? <>
            Downloaded <b>{dl.name}</b> · {mb(dl.bytes)}<br />
            manifest SHA-256 <b>{dl.header ?? "no header"}</b><br />
            {check ? (check.ok
              ? <span className="ok2">✓ every listed file matches its size and SHA-256 ({check.files.length} files) · checked in the browser</span>
              : <span className="bad">✗ {[...check.problems, ...check.files.filter((f) => !f.ok).map((f) => `${f.path}: ${f.problem}`)].slice(0, 6).join(" · ")}</span>)
              : progress ? `Checking file ${progress[0]} of ${progress[1]}…` : null}
            {check?.manifest && <><br />withheld: {check.manifest.withheld.length ? check.manifest.withheld.join(", ") : "nothing"} · protected left out: {check.manifest.protected_excluded}</>}
            <br />Repeat the check: <code>python3 backend/scripts/verify_export.py {dl.name}</code>
          </> : <>The same request on the same records gives the same bytes. The manifest holds no request time.</>}
        </div>
        <div className="btns dlg-btns">
          <button className="pri" disabled={busy} onClick={download}>{busy && !dl ? "Building…" : dl ? "Download again" : "Download"}</button>
          <button disabled={!dl || busy} onClick={verify}>Check files</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
