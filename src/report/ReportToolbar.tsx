import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useReportStore } from './reportStore';
import { ReportSwitcher } from './ReportSwitcher';
import { ReportFormatBar } from './ReportFormatBar';
import { DeleteReportDialog } from './ReportDialogs';
import { useReportPdfExport } from './useReportPdfExport';
import { toolbarDanger, toolbarDivider, toolbarIconButton } from './toolbarStyles';
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/useWorkspaceLease';

interface ReportToolbarProps {
  activeReportId: string | null;
  editor?: Editor | null;
  onNewReport?: () => void;
  onSelectReport?: () => void;
  onInsertTable?: () => void;
  onInsertEmbeddedTable?: () => void;
  onInsertChart?: () => void;
}

interface TipTapTextNode {
  text?: string;
  content?: TipTapTextNode[];
}

function countWords(node: TipTapTextNode | undefined): number {
  if (!node) return 0;
  const extractText = (current: TipTapTextNode): string => {
    if (!current) return '';
    if (current.text) return current.text;
    if (current.content) return current.content.map(extractText).join(' ');
    return '';
  };
  return extractText(node).split(/\s+/).filter(Boolean).length;
}

export function ReportToolbar({
  activeReportId,
  editor,
  onNewReport,
  onSelectReport,
  onInsertTable,
  onInsertEmbeddedTable,
  onInsertChart,
}: ReportToolbarProps) {
  const reports = useReportStore((state) => state.reports);
  const duplicateReport = useReportStore((state) => state.duplicateReport);
  const deleteReport = useReportStore((state) => state.deleteReport);
  const persistenceStatus = useReportStore((state) => state.persistenceStatus);
  const persistenceError = useReportStore((state) => state.persistenceError);
  const { canEdit } = useWorkspaceLease();
  const blocked = canEdit ? {} : { disabled: true, title: EDITING_ELSEWHERE_TOOLTIP };
  const { isExporting, error: exportError, exportPdf } = useReportPdfExport();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const activeReport = activeReportId ? reports[activeReportId] || null : null;
  const wordCount = activeReport?.tiptapContent?.content
    ? countWords(activeReport.tiptapContent as TipTapTextNode)
    : 0;

  const statusMessage = exportError
    || (persistenceStatus === 'error' ? 'Save failed' : null)
    || (persistenceStatus === 'saving' ? 'Saving…' : null);

  return (
    <div
      data-report-toolbar
      className="flex min-h-14 flex-wrap items-center gap-x-1 gap-y-1 border-b border-border bg-surface px-2 py-1.5 print:hidden sm:px-3 xl:h-14 xl:flex-nowrap xl:py-0"
    >
      <div className="flex min-w-0 flex-1 items-center gap-0.5 xl:flex-none">
        {onNewReport && (
          <button
            type="button"
            onClick={onNewReport}
            title="New report"
            aria-label="New report"
            className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-green text-white outline-none transition-colors hover:bg-accent-green-hover focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8"
            {...blocked}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}

        <ReportSwitcher activeReportId={activeReportId} onSelectReport={onSelectReport} />

        {activeReport && (
          <>
            <button
              type="button"
              onClick={() => duplicateReport(activeReport.id)}
              title="Duplicate report"
              aria-label="Duplicate report"
              className={toolbarIconButton}
              {...blocked}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 8h11v11H8zM5 16H4V5h11v1" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              title="Delete report"
              aria-label="Delete report"
              className={`${toolbarIconButton} ${toolbarDanger}`}
              {...blocked}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
              </svg>
            </button>
          </>
        )}
      </div>

      {activeReport && editor && (
        <>
          <span className={`${toolbarDivider} hidden xl:block`} aria-hidden="true" />
          <ReportFormatBar editor={editor} blocked={blocked} />
        </>
      )}

      <div className="flex shrink-0 items-center gap-0.5 xl:ml-auto">
        {(onInsertEmbeddedTable || onInsertChart || onInsertTable) && (
          <>
            <div className="flex items-center gap-0.5" role="group" aria-label="Insert">
              {onInsertEmbeddedTable && (
                <button
                  type="button"
                  onClick={onInsertEmbeddedTable}
                  aria-label="Insert linked table"
                  title="Linked table — live excerpt from project data"
                  className={toolbarIconButton}
                  {...blocked}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 6h16v12H4zM4 10h16M10 10v8" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M16 3.5a2 2 0 100 4 2 2 0 000-4z" />
                  </svg>
                </button>
              )}
              {onInsertChart && (
                <button
                  type="button"
                  onClick={onInsertChart}
                  aria-label="Insert chart"
                  title="Chart — visualize a project table"
                  className={toolbarIconButton}
                  {...blocked}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 20V10m7 10V4m7 16v-7" />
                  </svg>
                </button>
              )}
              {onInsertTable && (
                <button
                  type="button"
                  onClick={onInsertTable}
                  aria-label="Insert manual table"
                  title="Manual table — small editable table in this report"
                  className={toolbarIconButton}
                  {...blocked}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14" />
                  </svg>
                </button>
              )}
            </div>
            <span className={toolbarDivider} aria-hidden="true" />
          </>
        )}

        {activeReport && (
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={isExporting}
            aria-label={isExporting ? 'Exporting report' : 'Export report as PDF'}
            title="Export report as PDF"
            className={toolbarIconButton}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        )}

        {activeReport && !statusMessage && (
          <span className="hidden whitespace-nowrap pl-1 text-xs text-text-tertiary 2xl:inline">
            {wordCount > 0 ? `${wordCount.toLocaleString()} words` : 'Empty report'}
          </span>
        )}
        {statusMessage && (
          <span
            className={`hidden max-w-40 truncate whitespace-nowrap pl-1 text-xs sm:inline ${
              exportError || persistenceStatus === 'error' ? 'text-error-text' : 'text-text-tertiary'
            }`}
            title={exportError || persistenceError || undefined}
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </span>
        )}
      </div>

      <DeleteReportDialog
        open={confirmingDelete}
        reportName={activeReport?.name ?? ''}
        onDelete={() => {
          if (activeReport) deleteReport(activeReport.id);
          setConfirmingDelete(false);
        }}
        onOpenChange={setConfirmingDelete}
      />
    </div>
  );
}
