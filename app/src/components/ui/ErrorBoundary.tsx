import React, { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[200px] p-6" role="alert">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4" aria-hidden="true">⚠️</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Something went wrong</h3>
            <p className="text-sm text-gray-500 mb-4">
              An unexpected error occurred. Please try again or refresh the page.
            </p>
            {this.state.error && (
              <details className="mb-4 text-left">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-600">
                  Error details
                </summary>
                <pre className="mt-2 text-xs text-red-600 bg-red-50 p-3 rounded-lg overflow-auto">
                  {this.state.error.message}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
