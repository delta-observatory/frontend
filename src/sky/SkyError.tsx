import { Component, type ReactNode } from "react";

/** Keep renderer failures local to the sky. */
export function SkyUnavailable({ reason }: { reason: string }) {
  return (
    <div className="sky-unavailable">
      <b>The sky view could not render.</b>
      <span>Browser reason: {reason}</span>
      <span>The table and inspection controls remain available.</span>
    </div>
  );
}

/** Keeps a sky render error inside the sky area. Without it, React removes the whole page. */
export class SkyBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() { return this.state.error ? <SkyUnavailable reason={this.state.error} /> : this.props.children; }
}
