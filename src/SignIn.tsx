import { useState, useSyncExternalStore, useEffect, createContext, useContext, type FormEvent, type ReactNode } from "react";
import { session } from "./api/client";

const SignInContext = createContext<() => void>(() => {});
export const useSignIn = () => useContext(SignInContext);

/** The GUI can browse through the optional read-only channel. Writes use a signed-in client. */
export function SignInGate({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(session.subscribe, session.token);
  const [guest, setGuest] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState(false);
  useEffect(() => {
    if (token) return;
    let live = true;
    fetch("/gui-api/me", { cache: "no-store" }).then((r) => { if (live) setGuest(r.ok); }, () => { if (live) setGuest(false); });
    return () => { live = false; };
  }, [token]);
  if (!token && guest === null) return <div className="signin"><p>Opening the observatory…</p></div>;
  if (!token && !guest) return <SignIn />;
  return <SignInContext.Provider value={() => setPrompt(true)}>{children}{prompt && <SignIn onClose={() => setPrompt(false)} />}</SignInContext.Provider>;
}

function SignIn({ onClose }: { onClose?: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/me", { cache: "no-store", headers: { Authorization: `Bearer ${value.trim()}` } });
      if (res.ok) session.set(value.trim());
      else setError(res.status === 401 ? "The API does not accept this token." : `${res.status} ${res.statusText}`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className={`signin${onClose ? " signin-overlay" : ""}`} role="dialog" aria-modal="true" aria-label="Sign in">
      <form onSubmit={submit}>
        <span className="brand">DELTA OBSERVATORY</span>
        <p>Sign in to start searches and save reviews.</p>
        <label htmlFor="token">Client token</label>
        <input id="token" type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="dlt_…" autoFocus spellCheck={false} />
        {error && <span className="err">{error}</span>}
        <button type="submit" disabled={busy || !value.trim()}>{busy ? "Checking…" : "Sign in"}</button>
        <span className="note">This browser keeps the token. Sign out from the top bar.</span>
        {onClose && <button type="button" onClick={onClose}>Continue browsing</button>}
      </form>
    </div>
  );
}
