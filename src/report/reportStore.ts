import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
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
} from './types';


let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(report: Report) {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveReportDB(report).catch(console.error);
  }, 500);
}


export const useReportStore = create<ReportStoreState>()(
  immer((set, get) => ({
    reports: {},
    selectedReportId: null,

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

      debouncedSave(report);

      return id;
    },

    updateReport: (id, updates) => {
      set((state) => {
        const report = state.reports[id];
        if (report) {
          Object.assign(report, updates);
          report.updatedAt = new Date().toISOString();
          // Persist to IndexedDB - use current() to get non-draft copy
          debouncedSave(current(report));
        }
      });
    },

    deleteReport: (id) => {
      set((state) => {
        delete state.reports[id];
        if (state.selectedReportId === id) {
          const remainingIds = Object.keys(state.reports);
          state.selectedReportId = remainingIds.length > 0 ? remainingIds[0] : null;
        }
      });
      deleteReportDB(id).catch(console.error);
    },

    selectReport: (id) => {
      set((state) => {
        state.selectedReportId = id;
      });
    },

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
          // Persist to IndexedDB - use current() to get non-draft copy
          debouncedSave(current(report));
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
            // Persist to IndexedDB - use current() to get non-draft copy
            debouncedSave(current(report));
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
            // Persist to IndexedDB - use current() to get non-draft copy
            debouncedSave(current(report));
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
            // Persist to IndexedDB - use current() to get non-draft copy
            debouncedSave(current(report));
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
          // Persist to IndexedDB - use current() to get non-draft copy
          debouncedSave(current(rep));
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
            
            report.blocks[blockIndex] = {
              id: existingBlock.id,
              type: newType,
              createdAt: existingBlock.createdAt,
              updatedAt: now,
              ...newProps,
            } as ReportBlock;
            
            report.updatedAt = now;
            // Persist to IndexedDB - use current() to get non-draft copy
            debouncedSave(current(report));
          }
        }
      });
    },

    getReport: (id) => {
      return get().reports[id];
    },

    getBlock: (reportId, blockId) => {
      const report = get().reports[reportId];
      return report?.blocks.find((b) => b.id === blockId);
    },
  }))
);


export async function initializeReportStore(): Promise<void> {
  try {
    const reports = await loadAllReports();
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
