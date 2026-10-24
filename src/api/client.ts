// HTTP access to the Delta Observatory API. Callers supply /api paths.
// In development, the Vite proxy sends /api to the cluster API.
// Signed-in requests carry a bearer token. Anonymous reads use the separate /gui-api channel.

export class ApiError extends Error {
  constructor(readonly status: number, readonly path: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = "delta.token";
let token: string | null = (() => { try { return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY); } catch { return null; } })();
const listeners = new Set<() => void>();

export const session = {
  token: () => token,
  /** Stores the token. A null token signs out. */
  set(next: string | null, remember = false) {
    token = next;
    try {
      localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem('delta.browsing');
      sessionStorage.removeItem('delta.current-investigation');sessionStorage.removeItem('delta.open-investigation');
      if(next)(remember?localStorage:sessionStorage).setItem(TOKEN_KEY,next);
      else sessionStorage.removeItem('delta.provider-onboarding');
    } catch { /* The token stays for this page only. */ }
    for (const l of listeners) l();
    // A new document clears every cached result when the client identity changes.
    location.reload();
  },
  async signOut() {
    try {if(window.deltaDesktop)await window.deltaDesktop.signOut();}
    finally {session.set(null);}
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

/** fetch for an absolute API path such as "/api/runs". A 401 response signs out, so the sign-in panel shows. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const path = !headers.has("Authorization") && url.startsWith("/api/") ? `/gui-api/${url.slice(5)}` : url;
  const res = await fetch(path, { cache: "no-store", ...init, headers });
  if (res.status === 401 && token) await session.signOut();
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
