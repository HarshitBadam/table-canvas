import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useReportStore } from './reportStore';
import { ReportSwitcher, type ReportSwitcherHandle } from './ReportSwitcher';
import { ReportActionsMenu } from './ReportActionsMenu';
import { ReportInsertMenu } from './ReportInsertMenu';
import { ReportFormatBar } from './ReportFormatBar';
import { DeleteReportDialog } from './ReportDialogs';
import { useReportExport } from './useReportExport';
import { toolbarIconButton } from './toolbarStyles';
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
  const { exporting, error: exportError, exportReport } = useReportExport();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [compactFormatOpen, setCompactFormatOpen] = useState(false);
  const switcherRef = useRef<ReportSwitcherHandle>(null);

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
      className="flex min-h-14 content-start flex-wrap items-center gap-x-1 border-b border-border bg-surface py-1.5 print:hidden xl:grid xl:h-14 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,auto)_minmax(0,1fr)] xl:gap-x-2 xl:py-0"
    >
      <div
        className="flex min-h-12 min-w-0 flex-1 self-start items-center gap-0.5 pl-2 sm:min-h-14 sm:pl-3"
        role="group"
        aria-label="Report"
      >
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

        <ReportSwitcher ref={switcherRef} activeReportId={activeReportId} onSelectReport={onSelectReport} />

        {activeReport && (
          <ReportActionsMenu
            blocked={blocked}
            exporting={exporting}
            onRename={() => switcherRef.current?.startRename()}
            onDuplicate={() => duplicateReport(activeReport.id)}
            onExportPdf={() => void exportReport('pdf')}
            onExportHtml={() => void exportReport('html')}
            onDelete={() => setConfirmingDelete(true)}
          />
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

      {activeReport && editor && (
        <button
          type="button"
          aria-label="Format text"
          aria-expanded={compactFormatOpen}
          onClick={() => setCompactFormatOpen(open => !open)}
          className={`${toolbarIconButton} xl:hidden ${compactFormatOpen ? 'bg-surface-secondary text-text-primary' : ''}`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5h14M9 5v14m0-7h7" />
          </svg>
        </button>
      )}

      {activeReport && editor && (
        <div
          className={`${compactFormatOpen ? 'flex' : 'hidden'} order-3 min-h-14 w-full basis-full items-center border-t border-border-subtle px-4 py-0 sm:px-5 xl:min-h-0 xl:order-none xl:flex xl:border-0 xl:px-0`}
          role="group"
          aria-label="Text formatting"
        >
          <div className="flex h-full w-full max-w-full translate-y-[2.5px] items-center overflow-x-auto overscroll-x-contain scrollbar-none xl:translate-y-0">
            <ReportFormatBar editor={editor} blocked={blocked} showDividers={!compactFormatOpen} />
          </div>
        </div>
      )}

      <div className="flex min-h-12 shrink-0 self-start items-center justify-self-end pr-2 sm:min-h-14 sm:pr-3">
        {activeReport && (
          <ReportInsertMenu
            blocked={blocked}
            onInsertEmbeddedTable={onInsertEmbeddedTable}
            onInsertChart={onInsertChart}
            onInsertTable={onInsertTable}
          />
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
