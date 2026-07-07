/**
 * Report Module
 *
 * Public surface for the TipTap-based report editor feature.
 */

// Types
export * from './types';

// Store
export {
  useReportStore,
  useSelectedReport,
  useReportsList,
  useHasReports,
  initializeReportStore,
} from './reportStore';

// Views
export { ReportView } from './ReportView';
export { ReportToolbar } from './ReportToolbar';

// Editor
export { TipTapEditor } from './editor';
export type { TipTapEditorHandle, TipTapEditorProps } from './editor';

// PDF export
export { exportReportToPDF } from './pdfExport';
