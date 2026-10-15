// HTTP access to the Delta Observatory API. All paths start with /api.
// In development, the Vite proxy sends /api to the cluster API.
// Each request carries the signed-in client's bearer token. The browser keeps the token in localStorage.

export class ApiError extends Error {
  constructor(readonly status: number, readonly path: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = "delta.token";
let token: string | null = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
const listeners = new Set<() => void>();

export const session = {
  token: () => token,
  /** Stores the token. A null token signs out. */
  set(next: string | null) {
    token = next;
    try { if (next) localStorage.setItem(TOKEN_KEY, next); else localStorage.removeItem(TOKEN_KEY); } catch { /* The token stays for this page only. */ }
    for (const l of listeners) l();
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

/** fetch for an absolute API path such as "/api/runs". A 401 response signs out, so the sign-in panel shows. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && token) session.set(null);
  return res;
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await apiFetch(`/api${path}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, path, `${res.status} ${res.statusText}: GET /api${path}`);
  return (await res.json()) as T;
}

/** Runs async tasks with at most `limit` in flight. */
export async function pool<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await task(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
