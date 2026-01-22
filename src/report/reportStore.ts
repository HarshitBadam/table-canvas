/**
 * Report Store
 * 
 * Zustand store for managing reports and their blocks.
 * Uses immer for immutable state updates.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { generateId } from '@/lib/utils';
import { 
  saveReport as saveReportDB, 
  deleteReport as deleteReportDB,
  loadAllReports,
} from '@/persistence/db';
import type { 
  Report, 
  ReportBlock, 
  ReportStoreState,
  NewBlock,
} from './types';

// ============================================================================
// Persistence Helpers
// ============================================================================

// Debounced save to IndexedDB
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(report: Report) {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveReportDB(report).catch(console.error);
  }, 500);
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useReportStore = create<ReportStoreState>()(
  immer((set, get) => ({
    // State
    reports: {},
    selectedReportId: null,

    // ========================================================================
    // Report Actions
    // ========================================================================

    addReport: (name?: string) => {
      const id = generateId();
      const now = new Date().toISOString();
      
      const report: Report = {
        id,
        name: name || 'Untitled Report',
        blocks: [],
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        state.reports[id] = report;
        state.selectedReportId = id;
      });

      // Persist to IndexedDB
      debouncedSave(report);

      return id;
    },

    updateReport: (id, updates) => {
      set((state) => {
        const report = state.reports[id];
        if (report) {
          Object.assign(report, updates);
          report.updatedAt = new Date().toISOString();
          // Persist to IndexedDB
          debouncedSave({ ...report });
        }
      });
    },

    deleteReport: (id) => {
      set((state) => {
        delete state.reports[id];
        if (state.selectedReportId === id) {
          // Select another report or null
          const remainingIds = Object.keys(state.reports);
          state.selectedReportId = remainingIds.length > 0 ? remainingIds[0] : null;
        }
      });
      // Delete from IndexedDB
      deleteReportDB(id).catch(console.error);
    },

    selectReport: (id) => {
      set((state) => {
        state.selectedReportId = id;
      });
    },

    // ========================================================================
    // Block Actions
    // ========================================================================

    addBlock: (reportId, blockData, index) => {
      const blockId = generateId();
      const now = new Date().toISOString();

      const block: ReportBlock = {
        ...blockData,
        id: blockId,
        createdAt: now,
        updatedAt: now,
      } as ReportBlock;

      set((state) => {
        const report = state.reports[reportId];
        if (report) {
          if (index !== undefined && index >= 0 && index <= report.blocks.length) {
            report.blocks.splice(index, 0, block);
          } else {
            report.blocks.push(block);
          }
          report.updatedAt = now;
          // Persist to IndexedDB
          debouncedSave({ ...report, blocks: [...report.blocks] });
        }
      });

      return blockId;
    },

    updateBlock: (reportId, blockId, updates) => {
      set((state) => {
        const report = state.reports[reportId];
        if (report) {
          const blockIndex = report.blocks.findIndex((b) => b.id === blockId);
          if (blockIndex !== -1) {
            const block = report.blocks[blockIndex];
            Object.assign(block, updates);
            block.updatedAt = new Date().toISOString();
            report.updatedAt = block.updatedAt;
            // Persist to IndexedDB
            debouncedSave({ ...report, blocks: [...report.blocks] });
          }
        }
      });
    },

    deleteBlock: (reportId, blockId) => {
      set((state) => {
        const report = state.reports[reportId];
        if (report) {
          const blockIndex = report.blocks.findIndex((b) => b.id === blockId);
          if (blockIndex !== -1) {
            report.blocks.splice(blockIndex, 1);
            report.updatedAt = new Date().toISOString();
            // Persist to IndexedDB
            debouncedSave({ ...report, blocks: [...report.blocks] });
          }
        }
      });
    },

    reorderBlocks: (reportId, fromIndex, toIndex) => {
      set((state) => {
        const report = state.reports[reportId];
        if (report && fromIndex !== toIndex) {
          const [block] = report.blocks.splice(fromIndex, 1);
          if (block) {
            report.blocks.splice(toIndex, 0, block);
            report.updatedAt = new Date().toISOString();
            // Persist to IndexedDB
            debouncedSave({ ...report, blocks: [...report.blocks] });
          }
        }
      });
    },

    duplicateBlock: (reportId, blockId) => {
      const { reports } = get();
      const report = reports[reportId];
      if (!report) return null;

      const blockIndex = report.blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return null;

      const originalBlock = report.blocks[blockIndex];
      const newBlockId = generateId();
      const now = new Date().toISOString();

      // Deep clone the block
      const newBlock: ReportBlock = {
        ...JSON.parse(JSON.stringify(originalBlock)),
        id: newBlockId,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const rep = state.reports[reportId];
        if (rep) {
          rep.blocks.splice(blockIndex + 1, 0, newBlock);
          rep.updatedAt = now;
          // Persist to IndexedDB
          debouncedSave({ ...rep, blocks: [...rep.blocks] });
        }
      });

      return newBlockId;
    },

    transformBlock: (reportId, blockId, newType, newProps = {}) => {
      set((state) => {
        const report = state.reports[reportId];
        if (report) {
          const blockIndex = report.blocks.findIndex((b) => b.id === blockId);
          if (blockIndex !== -1) {
            const now = new Date().toISOString();
            const existingBlock = report.blocks[blockIndex];
            
            // Create new block with transformed type while preserving id and timestamps
            report.blocks[blockIndex] = {
              id: existingBlock.id,
              type: newType,
              createdAt: existingBlock.createdAt,
              updatedAt: now,
              ...newProps,
            } as ReportBlock;
            
            report.updatedAt = now;
            // Persist to IndexedDB
            debouncedSave({ ...report, blocks: [...report.blocks] });
          }
        }
      });
    },

    // ========================================================================
    // Selectors
    // ========================================================================

    getReport: (id) => {
      return get().reports[id];
    },

    getBlock: (reportId, blockId) => {
      const report = get().reports[reportId];
      return report?.blocks.find((b) => b.id === blockId);
    },
  }))
);

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook to get the currently selected report
 */
export const useSelectedReport = () => {
  return useReportStore((state) => {
    const { selectedReportId, reports } = state;
    return selectedReportId ? reports[selectedReportId] : null;
  });
};

/**
 * Hook to get all reports as an array
 * Note: This returns a new array on each store update.
 * For better performance, use useReportStore((state) => state.reports) directly
 * and memoize in your component with useMemo.
 */
export const useReportsList = () => {
  return useReportStore((state) => state.reports);
};

/**
 * Hook to check if there are any reports
 */
export const useHasReports = () => {
  return useReportStore((state) => Object.keys(state.reports).length > 0);
};

// ============================================================================
// Block Factory Functions
// ============================================================================

export function createTextBlock(content: string = ''): NewBlock {
  return {
    type: 'text',
    content,
  };
}

export function createHeadingBlock(level: 1 | 2 | 3, content: string = ''): NewBlock {
  return {
    type: 'heading',
    level,
    content,
  };
}

export function createChartBlock(
  sourceTableId: string,
  chartType: 'bar' | 'line' | 'pie' | 'scatter',
  config: Partial<import('./types').EnhancedChartConfig> = {}
): NewBlock {
  return {
    type: 'chart',
    sourceTableId,
    chartType,
    config: {
      showLegend: true,
      legendPosition: 'bottom',
      showGrid: true,
      ...config,
    },
  };
}

export function createTableSnippetBlock(
  sourceTableId: string,
  selectedColumns: string[] = [],
  rowLimit: number = 10
): NewBlock {
  return {
    type: 'table_snippet',
    sourceTableId,
    selectedColumns,
    rowSelectionMode: 'first_n',
    rowLimit,
    showRowNumbers: true,
  };
}

export function createDividerBlock(): NewBlock {
  return {
    type: 'divider',
  };
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the report store with data from IndexedDB
 */
export async function initializeReportStore(): Promise<void> {
  try {
    const reports = await loadAllReports();
    // Only update if we actually got reports (or an empty object)
    if (reports && typeof reports === 'object') {
      useReportStore.setState((state) => ({
        ...state,
        reports,
      }));
    }
  } catch (error) {
    console.error('[ReportStore] Failed to load reports from IndexedDB:', error);
  }
}
