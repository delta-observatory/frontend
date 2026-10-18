import { useCallback, useEffect, useRef, useState } from "react";
import { records, type AgentTask, type Campaign, type Candidate } from "../api/records";

export interface RecordLists {
  candidates: Candidate[] | null;
  tasks: AgentTask[] | null;
  campaigns: Campaign[] | null;
  error: string | null;
  refresh: () => void;
}

/**
 * Candidates, agent tasks, and campaigns. The first load waits for `start`, so that the sky and the catalogue load first.
 * The lists refresh every 5 s while a task is claimed, and every 30 s at other times.
 */
export function useRecords(start: boolean): RecordLists {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [tasks, setTasks] = useState<AgentTask[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    const g = ++generation.current;
    Promise.all([records.candidates(), records.tasks(), records.campaigns()]).then(
      ([c, t, k]) => {
        if (g !== generation.current) return;
        setCandidates(c.items); setTasks(t.items); setCampaigns(k); setError(null);
        timer.current = window.setTimeout(refresh, t.items.some((x) => x.state === "claimed") ? 5000 : 30000);
      },
      (e: Error) => { if (g === generation.current) { setError(e.message); timer.current = window.setTimeout(refresh, 30000); } },
    );
  }, []);
  useEffect(() => {
    if (!start) return;
    // After the first sky frame and the catalogue: the record lists are not on the critical path.
    const id = window.setTimeout(refresh, 50);
    return () => { clearTimeout(id); generation.current++; clearTimeout(timer.current); };
  }, [start, refresh]);
  return { candidates, tasks, campaigns, error, refresh };
}
