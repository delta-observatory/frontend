import { useEffect, useState } from "react";
import { getJson } from "../api/client";
import type { RunSummary } from "../api/types";

/** The workbench message when the shown run has no job for the selected observation.
 * GET /api/runs?observation_id= lists the runs that hold it, and a button shows one of them. */
export function RunsHolding({ message, observationId, onShow }: { message: string; observationId: string | null; onShow: (id: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const noJob = /no job/.test(message);
  useEffect(() => {
    setRuns(null);
    if (!noJob || !observationId) return;
    const ctl = new AbortController();
    getJson<RunSummary[]>(`/runs?observation_id=${observationId}&limit=50`, ctl.signal).then(setRuns, () => setRuns([]));
    return () => ctl.abort();
  }, [noJob, observationId]);
  if (!noJob) return <div className="empty">{message}</div>;
  return (
    <div className="empty runs-holding">
      <span>The shown run has no job for this observation.</span>
      {runs == null ? <span>Finding runs that include it…</span>
        : runs.length === 0 ? <span>No run includes it. Start one in the Run tab.</span>
        : runs.map((r) => (
          <button key={r.id} onClick={() => onShow(r.id)}>
            Show run <b>{r.label || r.id.slice(0, 8)}</b> · {r.method_id} v{r.method_version} · {r.job_states.complete ?? 0}/{r.input_count} complete
          </button>
        ))}
    </div>
  );
}
