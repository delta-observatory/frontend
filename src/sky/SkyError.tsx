import { Component, type ReactNode } from "react";

/** Message in the sky area when WebGL is not available. The table, search, and inspector still work. */
export function SkyUnavailable({ reason }: { reason: string }) {
  return (
    <div className="sky-unavailable">
      <b>The sky view needs WebGL 2. This browser did not create a WebGL 2 context.</b>
      <span>Browser reason: {reason}</span>
      <span>Open chrome://gpu and look at "WebGL2" under Graphics Feature Status. A browser started with --disable-gpu has no WebGL.</span>
    </div>
  );
}

/** Keeps a sky render error inside the sky area. Without it, React removes the whole page. */
export class SkyBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() { return this.state.error ? <SkyUnavailable reason={this.state.error} /> : this.props.children; }
}
