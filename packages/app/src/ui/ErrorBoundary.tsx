/**
 * Last-resort error boundary. Without one, any uncaught render/effect error
 * crashes the whole React tree and freezes on whatever was last painted — which
 * for us was the splash, presenting as a "stuck spinner". This catches it and
 * shows a recoverable message instead.
 */
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface in the console for debugging; never re-throw.
    console.error("[jemaw] uncaught error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100%",
            display: "grid",
            placeItems: "center",
            padding: 24,
            textAlign: "center",
            gap: 12,
          }}
        >
          <div>
            <div className="t-screen-title" style={{ marginBottom: 8 }}>
              Something went wrong
            </div>
            <p className="t-caption" style={{ opacity: 0.7, marginBottom: 16 }}>
              Please close and reopen Jemaw from your group.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 18px",
                borderRadius: "var(--r-full)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
