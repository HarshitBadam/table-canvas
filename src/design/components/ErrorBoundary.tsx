/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors in child component tree and displays a fallback UI.
 */

import { Component, ReactNode, ErrorInfo } from 'react';


export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback UI to show when error occurs */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional error boundary name for debugging */
  name?: string;
  /** Compact mode for smaller UI contexts */
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}


export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Log error for debugging
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ''}]`, error, errorInfo);
    
    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Custom fallback
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error, this.handleReset);
        }
        return this.props.fallback;
      }

      // Default fallback
      return (
        <DefaultErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
          compact={this.props.compact}
          name={this.props.name}
        />
      );
    }

    return this.props.children;
  }
}


interface DefaultErrorFallbackProps {
  error: Error;
  onReset: () => void;
  compact?: boolean;
  name?: string;
}

function DefaultErrorFallback({ error, onReset, compact, name }: DefaultErrorFallbackProps) {
  const isDev = process.env.NODE_ENV === 'development';

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 bg-error-light rounded-lg border border-error/20">
        <ErrorIcon className="w-4 h-4 text-error flex-shrink-0" />
        <span className="text-xs text-error-dark truncate flex-1">
          {name ? `${name}: ` : ''}Something went wrong
        </span>
        <button
          onClick={onReset}
          className="text-xs text-error hover:text-error-dark underline flex-shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] p-6 bg-surface rounded-xl border border-border">
      <div className="w-12 h-12 rounded-full bg-error-light flex items-center justify-center mb-4">
        <ErrorIcon className="w-6 h-6 text-error" />
      </div>
      
      <h3 className="text-lg font-semibold text-text-primary mb-2">
        Something went wrong
      </h3>
      
      <p className="text-sm text-text-secondary text-center mb-4 max-w-md">
        {name ? `Error in ${name}: ` : ''}
        {error.message || 'An unexpected error occurred.'}
      </p>

      {isDev && (
        <details className="mb-4 max-w-full">
          <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary">
            Show error details
          </summary>
          <pre className="mt-2 p-3 bg-surface-secondary rounded-lg text-xs text-text-secondary overflow-auto max-h-40 max-w-lg">
            {error.stack || error.toString()}
          </pre>
        </details>
      )}

      <button
        onClick={onReset}
        className="btn btn-primary text-sm"
      >
        <RefreshIcon className="w-4 h-4 mr-2" />
        Try Again
      </button>
    </div>
  );
}


function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}


export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary name={displayName} {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );
  
  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;
  
  return ComponentWithErrorBoundary;
}
