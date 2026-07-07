/**
 * Feature Error Boundary
 * 
 * Provides granular error handling for feature sections with retry capability
 * and graceful degradation. Unlike the global ErrorBoundary, this one allows
 * features to fail independently without crashing the entire app.
 */

import { Component, ReactNode, ErrorInfo } from 'react'

export interface FeatureErrorBoundaryProps {
  /** The content to render */
  children: ReactNode
  /** Name of the feature for error reporting */
  featureName: string
  /** Fallback UI when the feature fails */
  fallback?: ReactNode | ((props: FallbackProps) => ReactNode)
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /** Whether to show retry button (default: true) */
  showRetry?: boolean
  /** Maximum number of retries (default: 3) */
  maxRetries?: number
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number
  /** Whether to show the "Continue anyway" option (default: false) */
  showContinue?: boolean
}

interface FallbackProps {
  error: Error
  retry: () => void
  retryCount: number
  canRetry: boolean
  dismiss: () => void
  featureName: string
}

interface FeatureErrorBoundaryState {
  hasError: boolean
  error: Error | null
  retryCount: number
  dismissed: boolean
}

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  constructor(props: FeatureErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      dismissed: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<FeatureErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[FeatureErrorBoundary] ${this.props.featureName}:`, error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    const { maxRetries = 3, retryDelay = 1000 } = this.props
    const { retryCount } = this.state

    if (retryCount >= maxRetries) return

    setTimeout(() => {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        retryCount: prevState.retryCount + 1,
      }))
    }, retryDelay)
  }

  handleDismiss = (): void => {
    this.setState({ dismissed: true })
  }

  render(): ReactNode {
    const { children, featureName, fallback, showRetry = true, maxRetries = 3, showContinue = false } = this.props
    const { hasError, error, retryCount, dismissed } = this.state

    // If dismissed, render nothing or a minimal indicator
    if (dismissed) {
      return (
        <div className="p-2 text-xs text-text-tertiary text-center">
          <span className="italic">{featureName} unavailable</span>
        </div>
      )
    }

    // If no error, render children
    if (!hasError || !error) {
      return children
    }

    const canRetry = showRetry && retryCount < maxRetries

    // Custom fallback
    if (fallback) {
      if (typeof fallback === 'function') {
        return fallback({
          error,
          retry: this.handleRetry,
          retryCount,
          canRetry,
          dismiss: this.handleDismiss,
          featureName,
        })
      }
      return fallback
    }

    // Default fallback UI
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <div className="flex items-start gap-3">
          {/* Warning icon */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-800/50 flex items-center justify-center">
            <svg 
              className="w-5 h-5 text-amber-600 dark:text-amber-400" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {featureName} encountered an issue
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 line-clamp-2">
              {error.message || 'An unexpected error occurred'}
            </p>
            
            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
                >
                  Try again {retryCount > 0 && `(${retryCount}/${maxRetries})`}
                </button>
              )}
              {showContinue && (
                <button
                  onClick={this.handleDismiss}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/50 rounded transition-colors"
                >
                  Continue without
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Minimal fallback for non-critical features.
 */
export function MinimalFallback({ featureName, retry, canRetry }: FallbackProps): JSX.Element {
  return (
    <div className="p-2 text-center">
      <p className="text-xs text-text-tertiary mb-2">{featureName} failed to load</p>
      {canRetry && (
        <button
          onClick={retry}
          className="text-xs text-accent-green hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * Compact inline fallback for small UI elements.
 */
export function InlineFallback({ featureName, retry, canRetry }: FallbackProps): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <span>{featureName} error</span>
      {canRetry && (
        <button onClick={retry} className="underline ml-1">retry</button>
      )}
    </span>
  )
}
