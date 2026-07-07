/**
 * Preload Functions
 *
 * Helpers to eagerly import heavy lazy-loaded components (e.g. on hover) so
 * the chunk is fetched before the component actually mounts. Kept separate
 * from LazyComponents.tsx so that file only exports components (required for
 * React Fast Refresh to work).
 */

/**
 * Preload ChartBuilder when user hovers over chart-related UI.
 */
export function preloadChartBuilder(): void {
  import('@/charts/ChartBuilder')
}

/**
 * Preload FilterPanel when user hovers over filter button.
 */
export function preloadFilterPanel(): void {
  import('@/grid/FilterPanel')
}

/**
 * Preload SuggestionsPanel when user hovers over suggestions button.
 */
export function preloadSuggestionsPanel(): void {
  import('@/suggestions/SuggestionsPanel')
}
