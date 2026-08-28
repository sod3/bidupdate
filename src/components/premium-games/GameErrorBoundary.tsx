"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Premium game scene failed", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="premium-fatal-error">
          <div><b>GAME PAUSED SAFELY</b><p>The scene could not be rendered. No new wager was created by this screen.</p><button onClick={() => location.reload()}>Reload game</button></div>
        </main>
      );
    }
    return this.props.children;
  }
}

export const GameErrorBoundary = ErrorBoundary;

