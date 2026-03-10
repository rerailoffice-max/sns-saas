"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AnalysisErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // #region agent log
    console.error("[DEBUG-e11e43] ErrorBoundary caught:", error.message, error.stack, errorInfo.componentStack);
    // #endregion
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 p-6 space-y-3">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
            {this.props.fallbackTitle ?? "コンポーネントエラー"}
          </h3>
          <p className="text-sm text-red-700 dark:text-red-300 font-mono break-all">
            {this.state.error?.message}
          </p>
          <pre className="text-xs text-red-600 dark:text-red-400 overflow-auto max-h-48 bg-red-100 dark:bg-red-900 p-3 rounded">
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
