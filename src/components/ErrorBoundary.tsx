import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level crash guard. Without this, a render error leaves the transparent
 * overlay window permanently blank with no way to recover except force-quit.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("nudge crashed:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="crash-backdrop interactive" role="alertdialog">
        <div className="crash-panel">
          <h2 className="crash-title">nudge hit a snag</h2>
          <p className="crash-message">
            Something went wrong while drawing your companion. Your activity
            data is safe — reloading usually fixes it.
          </p>
          <pre className="crash-detail">{this.state.error.message}</pre>
          <button
            type="button"
            className="crash-reload"
            onClick={this.handleReload}
          >
            Reload nudge
          </button>
        </div>
      </div>
    );
  }
}
