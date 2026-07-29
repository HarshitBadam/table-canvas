import { useCallback, useState } from 'react';
import { useReportStore } from './reportStore';

export interface ReportPdfExport {
  isExporting: boolean;
  error: string | null;
  exportPdf: () => Promise<void>;
}

/** Renders the open report's editor content to a PDF, saving pending edits first. */
export function useReportPdfExport(): ReportPdfExport {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportPdf = useCallback(async () => {
    const reportContent = document.querySelector('.report-view .tiptap-editor-content');
    const currentReportId = useReportStore.getState().selectedReportId;
    const report = currentReportId ? useReportStore.getState().reports[currentReportId] : null;
    if (!reportContent || !report) {
      setError('Open a report before exporting.');
      return;
    }
    setIsExporting(true);
    setError(null);
    try {
      await useReportStore.getState().flushSaves();
      const { exportReportToPDF } = await import('./pdfExport');
      await exportReportToPDF(reportContent as HTMLElement, {
        reportName: report.name || 'Report',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PDF export failed');
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { isExporting, error, exportPdf };
}
