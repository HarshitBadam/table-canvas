/**
 * Feature Flags
 * 
 * Runtime feature toggles for gradual rollout and A/B testing.
 * These can be overridden via environment variables or remote config.
 */

// ============================================================================
// Feature Flag Definitions
// ============================================================================

export interface FeatureFlags {
  /** Enable the new suggestions panel */
  suggestionsPanel: boolean
  
  /** Enable recipe-based transformations */
  recipesEnabled: boolean
  
  /** Enable Phase 2 column profiling (advanced stats) */
  advancedProfiling: boolean
  
  /** Enable cell highlighting feature */
  cellHighlighting: boolean
  
  /** Enable formula columns in source tables */
  formulaColumns: boolean
  
  /** Enable chart creation from grid view */
  chartsFromGrid: boolean
  
  /** Enable dashboard view */
  dashboardView: boolean
  
  /** Enable auto-arrange functionality in canvas */
  canvasAutoArrange: boolean
  
  /** Enable keyboard shortcuts */
  keyboardShortcuts: boolean
  
  /** Enable undo/redo functionality */
  undoRedo: boolean
  
  /** Enable dark mode toggle */
  darkMode: boolean
  
  /** Enable auto-save to backend */
  autoSave: boolean
  
  /** Enable verbose logging for debugging */
  debugLogging: boolean
}

// ============================================================================
// Default Feature Flags
// ============================================================================

export const defaultFeatureFlags: FeatureFlags = {
  suggestionsPanel: true,
  recipesEnabled: true,
  advancedProfiling: true,
  cellHighlighting: true,
  formulaColumns: true,
  chartsFromGrid: true,
  dashboardView: true,
  canvasAutoArrange: true,
  keyboardShortcuts: true,
  undoRedo: true,
  darkMode: true,
  autoSave: true,
  debugLogging: import.meta.env.DEV,
}

// ============================================================================
// Feature Flag State
// ============================================================================

let currentFlags: FeatureFlags = { ...defaultFeatureFlags }

/**
 * Get the current value of a feature flag
 */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return currentFlags[flag]
}

/**
 * Update feature flags (for runtime configuration)
 */
export function setFeatureFlags(updates: Partial<FeatureFlags>): void {
  currentFlags = { ...currentFlags, ...updates }
}

/**
 * Reset feature flags to defaults
 */
export function resetFeatureFlags(): void {
  currentFlags = { ...defaultFeatureFlags }
}

/**
 * Get all current feature flags
 */
export function getFeatureFlags(): Readonly<FeatureFlags> {
  return currentFlags
}
