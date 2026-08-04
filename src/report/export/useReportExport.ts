import { useCallback, useRef, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useReportStore } from '../reportStore';

type ReportExportFormat = 'pdf' | 'html';

export interface ReportExport {
  /** The format currently being exported, or null when idle. */
  exporting: ReportExportFormat | null;
  error: string | null;
  exportReport: (format: ReportExportFormat) => Promise<void>;
}

/**
 * Pending edits are flushed first so the export reflects what the user sees,
 * then the stored document is serialised. Reads state at call time rather than
 * through subscriptions to keep the callback stable.
 */
export function useReportExport(): ReportExport {
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const exportReport = useCallback(async (format: ReportExportFormat) => {
    if (inFlight.current) return;

    const { selectedReportId, reports } = useReportStore.getState();
    const report = selectedReportId ? reports[selectedReportId] : null;
    if (!report) {
      setError('Open a report before exporting.');
      return;
    }

    inFlight.current = true;
    setExporting(format);
    setError(null);
    try {
      await useReportStore.getState().flushSaves();
      // Re-read after the flush so any coalesced edits are included.
      const current = useReportStore.getState().reports[report.id] ?? report;
      const nodes = useProjectStore.getState().nodes;

      if (format === 'html') {
        const { exportReportToHtml } = await import('./htmlExport');
        await exportReportToHtml({ report: current, nodes });
      } else {
        const { exportReportToPDF } = await import('./pdfExport');
        await exportReportToPDF({ report: current, nodes });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed');
    } finally {
      inFlight.current = false;
      setExporting(null);
    }
  }, []);

  return { exporting, error, exportReport };
}
