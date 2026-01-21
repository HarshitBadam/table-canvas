/**
 * Features Module
 * 
 * Feature-based modules containing components, hooks, and feature-specific logic.
 * Each feature is self-contained with its own components, hooks, and services.
 */

// Feature exports will be added as features are reorganized
// For now, re-export from existing locations

// Canvas feature
export * from '@/canvas/CanvasView';

// Grid feature  
export * from '@/grid/GridView';

// Charts feature
export * from '@/charts/ChartView';
export * from '@/charts/ChartBuilder';
export * from '@/charts/ChartRenderer';

// Suggestions feature
export * from '@/suggestions/SuggestionsPanel';

// Auth feature
export * from '@/auth';
