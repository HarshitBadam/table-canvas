/**
 * State Management Module
 * 
 * Centralized exports for all state management utilities.
 */

// Stores
export * from './stores';

// Providers
export * from './providers';

// Legacy exports for backward compatibility
export { useProjectStore, useCanUndo, useCanRedo } from './projectStore';
export { useDataStore } from './dataStore';
export { AppProvider } from './AppContext';
export { useApp, useAppReady, useAppAuth } from './appContext';
