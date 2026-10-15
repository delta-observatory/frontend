import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { session } from "./api/client";

/** Shows the app only with a token. Each person and agent has its own token. The API refuses a request without one. */
export function SignInGate({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(session.subscribe, session.token);
  return token ? <>{children}</> : <SignIn />;
}

function SignIn() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${value.trim()}` } });
      if (res.ok) session.set(value.trim());
      else setError(res.status === 401 ? "The API does not accept this token." : `${res.status} ${res.statusText}`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="signin">
      <form onSubmit={submit}>
        <span className="brand">DELTA OBSERVATORY</span>
        <label htmlFor="token">Client token</label>
        <input id="token" type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="dlt_…" autoFocus spellCheck={false} />
        {error && <span className="err">{error}</span>}
        <button type="submit" disabled={busy || !value.trim()}>{busy ? "Checking…" : "Sign in"}</button>
        <span className="note">This browser keeps the token. Sign out from the top bar.</span>
      </form>
    </div>
  );
}
