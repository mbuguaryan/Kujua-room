import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { error: Error | null };

/** Replaces Next's app/error.tsx. Same markup, same copy. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Kujua Room render error", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="center-state">
        <h1>Something went wrong</h1>
        <p>Kujua Room could not load this page.</p>
        <button className="btn primary" onClick={this.reset}>
          Try again
        </button>
      </main>
    );
  }
}
