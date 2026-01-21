/**
 * Grid Module
 * 
 * Data grid functionality with virtual scrolling, editing, and Excel-like features.
 */

// Main view component
export { GridView } from './GridView';

// Sub-components
export * from './components';

// Hooks
export * from './hooks';

// Utilities
export { applyFilters, createEmptyFilterConfig, hasActiveFilters, countActiveFilters } from './filterUtils';
export type { GridFilterConfig } from './filterUtils';

export { detectPattern, generateNextValues } from './autofill';
