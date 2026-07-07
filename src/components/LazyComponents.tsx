/**
 * Lazy-loaded Components
 * 
 * Heavy components loaded on-demand using React.lazy for better
 * initial bundle size and faster first paint.
 */

import React, { Suspense, lazy, ComponentType } from 'react'
import { LoadingSpinner } from './LoadingSpinner'

// ============================================================================
// Loading Fallback Components
// ============================================================================

/** Default loading spinner for lazy components */
function DefaultFallback() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <LoadingSpinner />
    </div>
  )
}

/** Panel loading state with skeleton */
function PanelFallback() {
  return (
    <div className="p-4 space-y-4">
      <div className="h-6 w-32 skeleton rounded" />
      <div className="space-y-2">
        <div className="h-4 w-full skeleton rounded" />
        <div className="h-4 w-3/4 skeleton rounded" />
        <div className="h-4 w-1/2 skeleton rounded" />
      </div>
    </div>
  )
}

/** Chart loading state */
function ChartFallback() {
  return (
    <div className="flex items-center justify-center min-h-[300px] bg-surface-secondary rounded-lg">
      <div className="text-center">
        <div className="spinner mx-auto mb-3" />
        <p className="text-sm text-text-secondary">Loading chart...</p>
      </div>
    </div>
  )
}

// ============================================================================
// Lazy Component Definitions
// ============================================================================

/** Lazy-loaded ChartBuilder */
export const LazyChartBuilder = lazy(() => 
  import('@/charts/ChartBuilder').then(module => ({ default: module.ChartBuilder }))
)

/** Lazy-loaded FilterPanel */
export const LazyFilterPanel = lazy(() => 
  import('@/grid/FilterPanel').then(module => ({ default: module.FilterPanel }))
)

/** Lazy-loaded SuggestionsPanel */
export const LazySuggestionsPanel = lazy(() => 
  import('@/suggestions/SuggestionsPanel').then(module => ({ default: module.SuggestionsPanel }))
)

/** Lazy-loaded RecipeWizard */
export const LazyRecipeWizard = lazy(() => 
  import('@/suggestions/RecipeWizard').then(module => ({ default: module.RecipeWizard }))
)

/** Lazy-loaded ChartView */
export const LazyChartView = lazy(() => 
  import('@/charts/ChartView').then(module => ({ default: module.ChartView }))
)

// ============================================================================
// Wrapped Components with Suspense
// ============================================================================

/** Higher-order component to wrap lazy components with Suspense */
function withSuspense<P extends object>(
  LazyComponent: ComponentType<P>,
  Fallback: ComponentType = DefaultFallback
): React.FC<P> {
  return function SuspenseWrapper(props: P) {
    return (
      <Suspense fallback={<Fallback />}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }
}

// ============================================================================
// Pre-wrapped Components
// ============================================================================

/** ChartBuilder with Suspense wrapper */
export const ChartBuilderLazy = withSuspense(LazyChartBuilder, ChartFallback)

/** FilterPanel with Suspense wrapper */
export const FilterPanelLazy = withSuspense(LazyFilterPanel, PanelFallback)

/** SuggestionsPanel with Suspense wrapper */
export const SuggestionsPanelLazy = withSuspense(LazySuggestionsPanel, PanelFallback)

/** RecipeWizard with Suspense wrapper */
export const RecipeWizardLazy = withSuspense(LazyRecipeWizard, PanelFallback)

/** ChartView with Suspense wrapper */
export const ChartViewLazy = withSuspense(LazyChartView, ChartFallback)
