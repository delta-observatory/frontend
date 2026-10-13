// HTTP access to the Delta Observatory API. All paths start with /api.
// In development, the Vite proxy sends /api to the cluster API.

export class ApiError extends Error {
  constructor(readonly status: number, readonly path: string, message: string) {
    super(message);
  }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal, headers: { Accept: "application/json" } });
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
