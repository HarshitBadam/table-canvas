/**
 * Error Boundary Components
 * 
 * Catches React errors and displays feature-appropriate error messages.
 */

import { Component, ErrorInfo, ReactNode, Suspense } from 'react'
import { Spinner } from './atoms/Spinner'

// ============================================================================
// Types
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode
  /** Custom fallback component */
  fallback?: ReactNode
  /** Feature name for error reporting */
  featureName?: string
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /** Allow retry */
  allowRetry?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

// ============================================================================
// Base ErrorBoundary
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[${this.props.featureName || 'App'}] Error caught by boundary:`, error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          featureName={this.props.featureName}
          onRetry={this.props.allowRetry ? this.handleRetry : undefined}
        />
      )
    }

    return this.props.children
  }
}

// ============================================================================
// Default Error Fallback
// ============================================================================

interface DefaultErrorFallbackProps {
  error?: Error
  featureName?: string
  onRetry?: () => void
}

function DefaultErrorFallback({ error, featureName, onRetry }: DefaultErrorFallbackProps) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-error/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          {featureName ? `${featureName} Error` : 'Something went wrong'}
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          {error?.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 text-sm font-medium bg-surface-secondary text-text-primary rounded-md hover:bg-surface-tertiary transition-colors"
            >
              Try Again
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium bg-accent-green text-white rounded-md hover:bg-accent-green-hover transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Feature-Specific Error Fallbacks
// ============================================================================

export function GridErrorFallback() {
  return (
    <div className="flex items-center justify-center h-full bg-surface border border-border rounded-lg">
      <div className="text-center p-8">
        <svg className="w-12 h-12 mx-auto mb-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-text-secondary">Unable to load table view</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm text-accent-green hover:underline"
        >
          Reload
        </button>
      </div>
    </div>
  )
}

export function CanvasErrorFallback() {
  return (
    <div className="flex items-center justify-center h-full bg-canvas">
      <div className="text-center p-8">
        <svg className="w-12 h-12 mx-auto mb-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <p className="text-sm text-text-secondary">Unable to load canvas</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm text-accent-green hover:underline"
        >
          Reload
        </button>
      </div>
    </div>
  )
}

export function ChartErrorFallback() {
  return (
    <div className="flex items-center justify-center h-full bg-surface border border-border rounded-lg">
      <div className="text-center p-8">
        <svg className="w-12 h-12 mx-auto mb-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm text-text-secondary">Unable to load chart</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 text-sm text-accent-green hover:underline"
        >
          Reload
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Loading Skeletons
// ============================================================================

export function GridSkeleton() {
  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-lg overflow-hidden animate-pulse">
      {/* Header */}
      <div className="flex h-11 border-b border-border bg-surface-secondary">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex-1 border-r border-border px-3 py-3">
            <div className="h-3 bg-surface-tertiary rounded w-3/4" />
          </div>
        ))}
      </div>
      {/* Rows */}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
        <div key={row} className="flex h-9 border-b border-border-subtle">
          {[1, 2, 3, 4, 5].map((col) => (
            <div key={col} className="flex-1 border-r border-border-subtle px-3 py-2">
              <div className="h-3 bg-surface-secondary rounded" style={{ width: `${40 + Math.random() * 40}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function CanvasSkeleton() {
  return (
    <div className="flex items-center justify-center h-full bg-canvas">
      <Spinner size="lg" />
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="flex items-center justify-center h-full bg-surface border border-border rounded-lg">
      <Spinner size="lg" />
    </div>
  )
}

// ============================================================================
// Feature Boundary Wrappers
// ============================================================================

interface FeatureBoundaryProps {
  children: ReactNode
  featureName: string
  fallback: ReactNode
  loadingFallback?: ReactNode
}

export function FeatureBoundary({ children, featureName, fallback, loadingFallback }: FeatureBoundaryProps) {
  return (
    <ErrorBoundary featureName={featureName} fallback={fallback} allowRetry>
      <Suspense fallback={loadingFallback || <Spinner size="lg" />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

/**
 * Grid feature boundary with appropriate fallbacks
 */
export function GridBoundary({ children }: { children: ReactNode }) {
  return (
    <FeatureBoundary
      featureName="Grid View"
      fallback={<GridErrorFallback />}
      loadingFallback={<GridSkeleton />}
    >
      {children}
    </FeatureBoundary>
  )
}

/**
 * Canvas feature boundary with appropriate fallbacks
 */
export function CanvasBoundary({ children }: { children: ReactNode }) {
  return (
    <FeatureBoundary
      featureName="Canvas"
      fallback={<CanvasErrorFallback />}
      loadingFallback={<CanvasSkeleton />}
    >
      {children}
    </FeatureBoundary>
  )
}

/**
 * Chart feature boundary with appropriate fallbacks
 */
export function ChartBoundary({ children }: { children: ReactNode }) {
  return (
    <FeatureBoundary
      featureName="Chart"
      fallback={<ChartErrorFallback />}
      loadingFallback={<ChartSkeleton />}
    >
      {children}
    </FeatureBoundary>
  )
}

// ============================================================================
// Additional Feature Boundaries
// ============================================================================

/**
 * Suggestions feature boundary
 */
export function SuggestionsBoundary({ children }: { children: ReactNode }) {
  return (
    <FeatureBoundary
      featureName="Suggestions"
      fallback={<SuggestionsErrorFallback />}
      loadingFallback={<Spinner size="md" />}
    >
      {children}
    </FeatureBoundary>
  )
}

/**
 * Filter feature boundary
 */
export function FilterBoundary({ children }: { children: ReactNode }) {
  return (
    <FeatureBoundary
      featureName="Filter"
      fallback={<FilterErrorFallback />}
      loadingFallback={<Spinner size="sm" />}
    >
      {children}
    </FeatureBoundary>
  )
}

/**
 * Modal feature boundary
 */
export function ModalBoundary({ children }: { children: ReactNode }) {
  return (
    <FeatureBoundary
      featureName="Modal"
      fallback={<ModalErrorFallback />}
      loadingFallback={<Spinner size="md" />}
    >
      {children}
    </FeatureBoundary>
  )
}

// ============================================================================
// Additional Error Fallbacks
// ============================================================================

export function SuggestionsErrorFallback() {
  return (
    <div className="flex items-center justify-center h-full bg-surface border border-border rounded-lg">
      <div className="text-center p-4">
        <svg className="w-8 h-8 mx-auto mb-2 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p className="text-xs text-text-secondary">Unable to load suggestions</p>
      </div>
    </div>
  )
}

export function FilterErrorFallback() {
  return (
    <div className="flex items-center justify-center p-4 bg-surface border border-border rounded-lg">
      <div className="text-center">
        <svg className="w-6 h-6 mx-auto mb-2 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <p className="text-xs text-text-secondary">Filter error</p>
      </div>
    </div>
  )
}

export function ModalErrorFallback() {
  return (
    <div className="flex items-center justify-center p-8 bg-surface border border-border rounded-lg">
      <div className="text-center">
        <svg className="w-10 h-10 mx-auto mb-3 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm text-text-secondary">Unable to load content</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 text-sm text-accent-green hover:underline"
        >
          Reload
        </button>
      </div>
    </div>
  )
}

/**
 * Inline error display for smaller contexts
 */
export function InlineError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 p-2 text-error bg-error/10 rounded border border-error/20">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-xs flex-1">{message || 'An error occurred'}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs underline hover:no-underline">
          Retry
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Feature areas for error boundaries
 */
export type FeatureArea = 'canvas' | 'grid' | 'chart' | 'suggestions' | 'filter' | 'modal' | 'dashboard'

// ============================================================================
// Aliases for Backward Compatibility
// ============================================================================

/** @deprecated Use CanvasBoundary instead */
export const CanvasErrorBoundary = CanvasBoundary

/** @deprecated Use GridBoundary instead */
export const GridErrorBoundary = GridBoundary

/** @deprecated Use ChartBoundary instead */
export const ChartErrorBoundary = ChartBoundary

/** @deprecated Use SuggestionsBoundary instead */
export const SuggestionsErrorBoundary = SuggestionsBoundary

/** @deprecated Use FilterBoundary instead */
export const FilterErrorBoundary = FilterBoundary

/** @deprecated Use ModalBoundary instead */
export const ModalErrorBoundary = ModalBoundary
