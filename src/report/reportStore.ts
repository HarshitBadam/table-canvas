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
import type {
  Report,
  ReportStoreState,
  ReportTemplateId,
  TipTapContent,
} from './types';

// ============================================================================
// Persistence Helpers
// ============================================================================

// Debounced save to IndexedDB, keyed per-report so rapid edits to one report
// never drop a pending save for another.
interface PendingSave {
  report: Report;
  timeout: ReturnType<typeof setTimeout>;
}

const pendingSaves = new Map<string, PendingSave>();
let initializationSequence = 0;

async function persistReport(report: Report): Promise<void> {
  useReportStore.setState({ persistenceStatus: 'saving', persistenceError: null });
  try {
    await saveReportDB(report);
    if (pendingSaves.size === 0) {
      useReportStore.setState({ persistenceStatus: 'saved', persistenceError: null });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save report';
    useReportStore.setState({ persistenceStatus: 'error', persistenceError: message });
    throw error;
  }
}

function debouncedSave(report: Report) {
  const existing = pendingSaves.get(report.id);
  if (existing) {
    clearTimeout(existing.timeout);
  }
  const timeout = setTimeout(() => {
    pendingSaves.delete(report.id);
    void persistReport(report).catch((error) => {
      console.error('[ReportStore] Failed to save report:', error);
    });
  }, 500);
  pendingSaves.set(report.id, { report, timeout });
  useReportStore.setState({ persistenceStatus: 'saving', persistenceError: null });
}

async function flushPendingSaves(): Promise<void> {
  const saves = [...pendingSaves.values()];
  pendingSaves.clear();
  for (const save of saves) clearTimeout(save.timeout);
  if (saves.length === 0) return;
  await Promise.all(saves.map(({ report }) => persistReport(report)));
}

function reportDocument(name: string, template: ReportTemplateId): TipTapContent {
  const heading = {
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: name }],
  };
  if (template === 'executive-summary') {
    return {
      type: 'doc',
      content: [
        heading,
        {
          type: 'callout',
          attrs: { variant: 'info' },
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'State the decision this report supports and the headline finding.' }],
          }],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Key findings' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] },
        { type: 'paragraph', content: [{ type: 'text', text: "Type '/' to add a chart or linked table." }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Recommended actions' }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      ],
    };
  }
  if (template === 'data-review') {
    return {
      type: 'doc',
      content: [
        heading,
        { type: 'paragraph', content: [{ type: 'text', text: 'Scope, source, and reporting period.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data overview' }] },
        { type: 'paragraph', content: [{ type: 'text', text: "Type '/' to embed a table with the fields under review." }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Quality observations' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Trends and outliers' }] },
        { type: 'paragraph', content: [{ type: 'text', text: "Type '/' to add a chart." }] },
      ],
    };
  }
  return {
    type: 'doc',
    content: [heading, { type: 'paragraph' }],
  };
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useReportStore = create<ReportStoreState>()(
  immer((set, get) => ({
    // State
    reports: {},
    selectedReportId: null,
    activeProjectId: null,
    persistenceStatus: 'idle',
    persistenceError: null,
    initializeProject: async (projectId) => {
      const sequence = ++initializationSequence;
      set((state) => {
        state.activeProjectId = projectId;
        state.reports = {};
        state.selectedReportId = null;
        state.persistenceStatus = 'loading';
        state.persistenceError = null;
      });
      try {
        await flushPendingSaves();
        const allReports = await loadAllReports();
        if (sequence !== initializationSequence) return;

        const projectReports: Record<string, Report> = {};
        const legacyReports: Report[] = [];
        for (const report of Object.values(allReports)) {
          if (report.projectId === projectId) {
            projectReports[report.id] = report;
          } else if (!report.projectId) {
            const migrated = { ...report, projectId, schemaVersion: 1 };
            projectReports[migrated.id] = migrated;
            legacyReports.push(migrated);
          }
        }
        if (legacyReports.length > 0) {
          await Promise.all(legacyReports.map(report => saveReportDB(report)));
        }
        if (sequence !== initializationSequence) return;
        const firstReport = Object.values(projectReports)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        set((state) => {
          state.reports = projectReports;
          state.selectedReportId = firstReport?.id ?? null;
          state.persistenceStatus = 'idle';
        });
      } catch (error) {
        if (sequence !== initializationSequence) return;
        set((state) => {
          state.persistenceStatus = 'error';
          state.persistenceError = error instanceof Error ? error.message : 'Unable to load reports';
        });
      }
    },

    reset: () => {
      initializationSequence += 1;
      for (const pending of pendingSaves.values()) clearTimeout(pending.timeout);
      pendingSaves.clear();
      set((state) => {
        state.reports = {};
        state.selectedReportId = null;
        state.activeProjectId = null;
        state.persistenceStatus = 'idle';
        state.persistenceError = null;
      });
    },

    // ========================================================================
    // Report Actions
    // ========================================================================

    addReport: (name?: string, template: ReportTemplateId = 'blank') => {
      const id = generateId();
      const now = new Date().toISOString();
      const reportName = name || 'Untitled Report';
      const projectId = get().activeProjectId;
      if (!projectId) {
        throw new Error('Cannot create a report without an active project');
      }

      const report: Report = {
        id,
        projectId,
        schemaVersion: 1,
        name: reportName,
        tiptapContent: reportDocument(reportName, template),
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

    duplicateReport: (id) => {
      const original = get().reports[id];
      const projectId = get().activeProjectId;
      if (!original || !projectId) return null;
      const newId = generateId();
      const now = new Date().toISOString();
      const duplicate: Report = {
        ...original,
        id: newId,
        projectId,
        name: `${original.name} (copy)`,
        tiptapContent: original.tiptapContent
          ? JSON.parse(JSON.stringify(original.tiptapContent)) as TipTapContent
          : undefined,
        createdAt: now,
        updatedAt: now,
      };
      set((state) => {
        state.reports[newId] = duplicate;
        state.selectedReportId = newId;
      });
      debouncedSave(duplicate);
      return newId;
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
      const pending = pendingSaves.get(id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingSaves.delete(id);
      }
      set((state) => {
        delete state.reports[id];
        if (state.selectedReportId === id) {
          const remainingIds = Object.keys(state.reports);
          state.selectedReportId = remainingIds.length > 0 ? remainingIds[0] : null;
        }
      });
      deleteReportDB(id).catch((error) => {
        console.error('[ReportStore] Failed to delete report:', error);
        useReportStore.setState({
          persistenceStatus: 'error',
          persistenceError: error instanceof Error ? error.message : 'Unable to delete report',
        });
      });
    },

    selectReport: (id) => {
      set((state) => {
        state.selectedReportId = id && state.reports[id] ? id : null;
      });
    },

    flushSaves: flushPendingSaves,

    // ========================================================================
    // Selectors
    // ========================================================================

    getReport: (id) => {
      return get().reports[id];
    },
  }))
);
