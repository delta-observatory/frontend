import { createContext, useContext } from "react";

/** The client of the token, from GET /api/me. */
export interface Me {
  id: string;
  name: string;
  kind: string;
  permissions?: string[];
  campaign_id?: string | null;
}

/**
 * What the display offers to the signed-in client. The API enforces every permission.
 * This only disables controls that the API would refuse, and says why.
 */
export interface Access {
  /** False until GET /me answers. */
  known: boolean;
  name: string | null;
  /** run.submit: run submission, retry, and cancellation of the client's own runs. */
  runs: boolean;
  /** record.write: candidates, assessments, decisions, notes, and agent tasks. */
  records: boolean;
  /** admin: cancellation of any run or job. */
  admin: boolean;
}

export function accessOf(me: Me | null): Access {
  const has = (p: string) => me?.permissions?.includes(p) ?? false;
  return { known: me != null, name: me?.name ?? null, runs: has("run.submit"), records: has("record.write"), admin: has("admin") };
}

const NEEDS = { runs: "run.submit", records: "record.write" } as const;

/** Null when the client may act. Otherwise the reason that the control is disabled. */
export function denied(a: Access, action: keyof typeof NEEDS): string | null {
  if (!a.known) return "Checking the permissions of this client.";
  if (a[action]) return null;
  return `This client can read only. The action needs the ${NEEDS[action]} permission.`;
}

/** run.submit cancels the client's own runs and jobs. admin cancels any. */
export function canCancel(a: Access, run: { requested_by?: string }): boolean {
  return a.admin || (a.runs && a.name != null && run.requested_by === `client:${a.name}`);
}

export const AccessContext = createContext<Access>(accessOf(null));
export const useAccess = () => useContext(AccessContext);
