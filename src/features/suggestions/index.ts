/**
 * Suggestions Feature Barrel Export
 * 
 * Re-exports all AI suggestions-related components and utilities.
 */

// Main component
export { SuggestionsPanel } from '@/suggestions/SuggestionsPanel'

// Sub-components
export { CleaningPanel } from '@/suggestions/CleaningPanel'
export { RecipeWizard } from '@/suggestions/RecipeWizard'

// Recipe Templates (individual functions)
export {
  createTrendRecipe,
  createContributionRecipe,
  createVarianceRecipe,
  createReconciliationRecipe,
  createRatioRecipe,
  getRecipesForTable,
} from '@/suggestions/RecipeTemplates'

// Engine
export { generateSuggestions, getColumnSuggestions } from '@/suggestions/suggestionEngine'

// Store
export { 
  useSuggestionsStore, 
  createContextKey, 
  generateTableVersionHash 
} from '@/suggestions/suggestionsStore'

// Preview Service (individual functions)
export {
  getCachedPreview,
  clearPreviewCache,
  usePreview,
} from '@/suggestions/PreviewService'

// Effects
export { computeSuggestionEffect } from '@/suggestions/computeEffects'

// Constants
export * from '@/suggestions/cleaningConstants'
