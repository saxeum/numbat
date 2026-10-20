import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorFallback } from "@/components/error-fallback";
import { Button } from "@/components/ui/button";

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

  componentDidCatch(error: Error, info: ErrorInfo) {
    // TODO(observability): forward to an error tracker (Sentry) — see
    // docs/production-readiness-plan.md P1.4.
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback message={this.state.error.message}>
          <Button onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </ErrorFallback>
      );
    }

    return this.props.children;
  }
}
