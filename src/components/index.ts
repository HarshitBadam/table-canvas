/**
 * Components Index
 * 
 * Export all shared components.
 */

// Core components
export { ImportButton } from './ImportButton'
export { LoadingScreen } from './LoadingScreen'
export { LoadingSpinner } from './LoadingSpinner'
export { Select } from './Select'
export { ThemeToggle, ThemeProvider } from './ThemeToggle'
export { useTheme } from './themeContext'
export { Tooltip } from './Tooltip'

// Error boundaries
export {
  ErrorBoundary,
  CanvasErrorBoundary,
  GridErrorBoundary,
  ChartErrorBoundary,
  SuggestionsErrorBoundary,
  FilterErrorBoundary,
  ModalErrorBoundary,
  InlineError,
} from './ErrorBoundary'
export type { FeatureArea } from './ErrorBoundary'

// Lazy-loaded components
export {
  LazyChartBuilder,
  LazyFilterPanel,
  LazySuggestionsPanel,
  LazyRecipeWizard,
  LazyChartView,
  ChartBuilderLazy,
  FilterPanelLazy,
  SuggestionsPanelLazy,
  RecipeWizardLazy,
  ChartViewLazy,
} from './LazyComponents'
export {
  preloadChartBuilder,
  preloadFilterPanel,
  preloadSuggestionsPanel,
} from './preloaders'
