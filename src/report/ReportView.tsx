/**
 * ReportView Component
 *
 * Main view for displaying and editing a report with TipTap.
 * Single seamless page - title is part of the content.
 * Includes toolbar for multi-report navigation and quick actions.
 */

import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useReportStore } from './reportStore';
import { TipTapEditor, type TipTapEditorHandle } from './editor/TipTapEditor';
import { ReportToolbar } from './ReportToolbar';
import type { JSONContent } from '@tiptap/react';
import type { Report, ReportTemplateId } from './types';

import './PrintStyles.css';

/** Default document for a report that has no content yet. */
function defaultDocFor(report: Report): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: report.name || 'Untitled' }],
      },
      { type: 'paragraph' },
    ],
  };
}

interface ReportViewProps {
  reportId: string | null;
  onOpenTable?: (tableId: string) => void;
}

export function ReportView({ reportId, onOpenTable }: ReportViewProps) {
  const report = useReportStore((state) => reportId ? state.reports[reportId] : undefined);
  const updateReport = useReportStore((state) => state.updateReport);
  const addReport = useReportStore((state) => state.addReport);
  const persistenceStatus = useReportStore((state) => state.persistenceStatus);
  const persistenceError = useReportStore((state) => state.persistenceError);
  const editorRef = useRef<TipTapEditorHandle>(null);

  // Resolve the content to display: the report's TipTap document, or a fresh
  // default document titled after the report when it has no content yet.
  const content = useMemo<JSONContent>(() => {
    if (!report) return { type: 'doc', content: [] };
    if (report.tiptapContent) return report.tiptapContent as unknown as JSONContent;
    return defaultDocFor(report);
  }, [report]);

  // Handle content changes - just save content, name is managed separately via toolbar
  const handleContentChange = useCallback((content: JSONContent) => {
    if (!reportId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateReport(reportId, { tiptapContent: content as unknown as any });
  }, [reportId, updateReport]);

  // Focus editor on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      editorRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [reportId]);

  // Toolbar action handlers
  const handleHighlight = useCallback(() => {
    editorRef.current?.toggleHighlight();
  }, []);

  const handleInsertTable = useCallback(() => {
    editorRef.current?.insertTable();
  }, []);
  const handleInsertEmbeddedTable = useCallback(() => {
    editorRef.current?.insertEmbeddedTable();
  }, []);
  const handleInsertChart = useCallback(() => {
    editorRef.current?.insertChart();
  }, []);

  if (!reportId || !report) {
    return (
      <div className="h-full flex flex-col bg-surface report-view">
        <ReportToolbar activeReportId={null} />
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-16">
            {persistenceStatus === 'loading' ? (
              <div className="text-center text-sm text-text-secondary">Loading reports…</div>
            ) : (
              <ReportStart
                error={persistenceError}
                onCreate={(name, template) => addReport(name, template)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface report-view">
      {/* Report Toolbar */}
      <ReportToolbar
        activeReportId={reportId}
        onHighlight={handleHighlight}
        onInsertTable={handleInsertTable}
        onInsertEmbeddedTable={handleInsertEmbeddedTable}
        onInsertChart={handleInsertChart}
      />

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 print:max-w-none print:px-0 print:py-8">
          <TipTapEditor
            ref={editorRef}
            content={content}
            onChange={handleContentChange}
            reportId={reportId}
            onOpenTable={onOpenTable}
            placeholder="Type '/' for commands..."
          />
        </div>
      </div>
    </div>
  );
}

function ReportStart({
  error,
  onCreate,
}: {
  error: string | null;
  onCreate: (name: string, template: ReportTemplateId) => void;
}) {
  const templates: Array<{
    id: ReportTemplateId;
    title: string;
    description: string;
  }> = [
    {
      id: 'blank',
      title: 'Blank report',
      description: 'Start with a clean document and add only what you need.',
    },
    {
      id: 'executive-summary',
      title: 'Executive summary',
      description: 'Frame findings, evidence, decisions, and recommended actions.',
    },
    {
      id: 'data-review',
      title: 'Data review',
      description: 'Document scope, quality observations, trends, and outliers.',
    },
  ];

  return (
    <div>
      <div className="mb-7 max-w-xl sm:mb-10">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Create a report</h1>
        <p className="text-sm text-text-secondary leading-6">
          Reports combine narrative, live table excerpts, and charts. Linked data stays
          connected to this project and refreshes when the source changes.
        </p>
        {error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
            Reports could not be loaded: {error}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onCreate(template.title, template.id)}
            className="text-left rounded-lg border border-border bg-surface px-4 py-4 hover:bg-surface-secondary hover:border-accent-green transition-colors"
          >
            <div className="font-medium text-text-primary mb-1">{template.title}</div>
            <div className="text-xs leading-5 text-text-secondary">{template.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
