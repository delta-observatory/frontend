import { apiFetch } from "../api/client";
export async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(`/api${path}`, {method:"POST",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(typeof error?.detail === "string" ? error.detail : JSON.stringify(error?.detail ?? response.statusText)); }
  return response.json() as Promise<T>;
}
