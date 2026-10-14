import { useSyncExternalStore } from "react";

/** The compact layout applies to narrow screens and to phones in landscape. */
const QUERY = "(max-width: 760px), (max-height: 520px) and (orientation: landscape)";
const mq = matchMedia(QUERY);

export function useCompact(): boolean {
  return useSyncExternalStore((cb) => { mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); }, () => mq.matches);
}
