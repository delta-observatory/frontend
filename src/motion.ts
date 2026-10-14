import { useSyncExternalStore } from "react";

/** Motion setting. "reduced" removes camera animation. The default follows the system setting. */
export type Motion = "animated" | "reduced";

const KEY = "delta.motion";
function initial(): Motion {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "animated" || saved === "reduced") return saved;
  } catch { /* Storage can be unavailable. The default applies. */ }
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "animated";
}

let value: Motion = initial();
document.documentElement.dataset.motion = value;
const listeners = new Set<() => void>();

export const motion = {
  get: () => value,
  set(next: Motion) {
    value = next;
    document.documentElement.dataset.motion = next;
    try { localStorage.setItem(KEY, next); } catch { /* The setting stays for this page only. */ }
    for (const l of listeners) l();
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useMotion = () => useSyncExternalStore(motion.subscribe, motion.get);
