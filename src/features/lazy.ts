/**
 * Lazy-Loaded Feature Components
 * 
 * Code-split components for improved initial load performance.
 * These components are loaded on-demand when first needed.
 */

import { lazy } from 'react';

// ============================================================================
// Charts Feature
// ============================================================================

/**
 * ChartBuilder - Complex chart configuration modal
 * Loaded when user creates or edits a chart
 */
export const LazyChartBuilder = lazy(() => 
  import('@/charts/ChartBuilder').then(m => ({ default: m.ChartBuilder }))
);

/**
 * ChartRenderer - Chart visualization component
 * Loaded when viewing charts
 */
export const LazyChartRenderer = lazy(() => 
  import('@/charts/ChartRenderer').then(m => ({ default: m.ChartRenderer }))
);

// ============================================================================
// Suggestions Feature
// ============================================================================

/**
 * SuggestionsPanel - Context-aware data suggestions
 * Loaded when user opens suggestions panel
 */
export const LazySuggestionsPanel = lazy(() => 
  import('@/suggestions/SuggestionsPanel').then(m => ({ default: m.SuggestionsPanel }))
);

// ============================================================================
// Grid Feature
// ============================================================================

/**
 * FilterPanel - Advanced filtering interface
 * Loaded when user opens filter panel
 */
export const LazyFilterPanel = lazy(() => 
  import('@/grid/FilterPanel').then(m => ({ default: m.FilterPanel }))
);

// ============================================================================
// Dashboard Feature
// ============================================================================

/**
 * Dashboard - Main dashboard view
 * Loaded when user navigates to dashboard
 */
export const LazyDashboard = lazy(() => 
  import('@/dashboard/Dashboard').then(m => ({ default: m.Dashboard }))
);

// ============================================================================
// Canvas Feature
// ============================================================================

/**
 * TransformModal - Transform configuration modal
 * Loaded when user creates transforms
 */
export const LazyTransformModal = lazy(() => 
  import('@/canvas/modals/TransformModal').then(m => ({ default: m.TransformModal }))
);

/**
 * NewTableModal - New table creation modal
 * Loaded when user creates new tables
 */
export const LazyNewTableModal = lazy(() => 
  import('@/canvas/modals/NewTableModal').then(m => ({ default: m.NewTableModal }))
);
