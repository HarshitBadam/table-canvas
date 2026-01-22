/**
 * State Management - Store exports
 * 
 * All Zustand stores are exported from this module.
 */

// Types
export type {
  ProjectStoreState,
  NodesSliceState,
  EdgesSliceState,
  PatchesSliceState,
  SelectionSliceState,
  HistorySliceState,
  HistoryEntry,
  HistoryState,
} from './types';

// Slice creators
export { createNodesSlice } from './nodesSlice';
export { createEdgesSlice, getIncomingEdges, getOutgoingEdges, getUpstreamNodeIds, getDownstreamNodeIds } from './edgesSlice';
export { createPatchesSlice, createInitialPatches } from './patchesSlice';
export { createHistorySlice } from './historySlice';
export { createSelectionSlice } from './selectionSlice';

// Main stores
export { useProjectStore, useCanUndo, useCanRedo } from '../projectStore';
export { useDataStore } from '../dataStore';

// Feature-specific stores
export { useSuggestionsStore } from '@/suggestions/suggestionsStore';
export { useProfilingStore } from '@/profiling/profiler';
