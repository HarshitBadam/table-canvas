/**
 * Report Store
 *
 * Zustand store for managing reports. Content is stored as TipTap JSON
 * (`tiptapContent`).
 *
 * Uses immer for immutable state updates and debounced persistence to
 * IndexedDB.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current } from 'immer';
import { generateId } from '@/lib/utils';
import {
  saveReport as saveReportDB,
  deleteReport as deleteReportDB,
  loadAllReports,
} from '@/persistence/db';
import type { Report, ReportStoreState } from './types';

// ============================================================================
// Persistence Helpers
// ============================================================================

// Debounced save to IndexedDB, keyed per-report so rapid edits to one report
// never drop a pending save for another.
const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedSave(report: Report) {
  const existing = saveTimeouts.get(report.id);
  if (existing) {
    clearTimeout(existing);
  }
  const timeout = setTimeout(() => {
    saveTimeouts.delete(report.id);
    saveReportDB(report).catch(console.error);
  }, 500);
  saveTimeouts.set(report.id, timeout);
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
      const reportName = name || 'Untitled Report';

      const report: Report = {
        id,
        name: reportName,
        tiptapContent: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: reportName }],
            },
            { type: 'paragraph' },
          ],
        },
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
          // Persist to IndexedDB - use current() to get a plain (non-draft) copy
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

    // ========================================================================
    // Selectors
    // ========================================================================

    getReport: (id) => {
      return get().reports[id];
    },
  }))
);

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the report store with data from IndexedDB
 */
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
