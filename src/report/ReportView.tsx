/**
 * ReportView Component
 * 
 * Main view for displaying and editing a report with TipTap.
 * Single seamless page - title is part of the content.
 * Includes toolbar for multi-report navigation and quick actions.
 */

import { useCallback, useRef, useEffect } from 'react';
import { useReportStore } from './reportStore';
import { TipTapEditor, type TipTapEditorHandle } from './editor/TipTapEditor';
import { ReportToolbar } from './ReportToolbar';
import { migrateReport, needsMigration } from './migrations/migrateToTipTap';
import type { JSONContent } from '@tiptap/react';

import './PrintStyles.css';

interface ReportViewProps {
  reportId: string;
  onOpenTable?: (tableId: string) => void;
}

export function ReportView({ reportId, onOpenTable }: ReportViewProps) {
  const report = useReportStore((state) => state.reports[reportId]);
  const updateReport = useReportStore((state) => state.updateReport);
  const editorRef = useRef<TipTapEditorHandle>(null);
  const hasMigrated = useRef(false);

  // Migrate report if needed
  useEffect(() => {
    if (report && needsMigration(report) && !hasMigrated.current) {
      hasMigrated.current = true;
      const migratedReport = migrateReport(report);
      updateReport(reportId, {
        tiptapContent: migratedReport.tiptapContent,
      });
    }
  }, [report, reportId, updateReport]);

  // Handle content changes - just save content, name is managed separately via toolbar
  const handleContentChange = useCallback((content: JSONContent) => {
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

  if (!report) {
    return (
      <div className="flex items-center justify-center h-full bg-surface">
        <div className="text-center">
          <div className="text-6xl mb-4">📄</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Report not found
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            This report may have been deleted.
          </p>
        </div>
      </div>
    );
  }

  // Get content - if no tiptapContent, create default with title as H1
  const content: JSONContent = report.tiptapContent || {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: report.name || 'Untitled' }],
      },
      {
        type: 'paragraph',
      },
    ],
  };

  return (
    <div className="h-full flex flex-col bg-surface report-view">
      {/* Report Toolbar */}
      <ReportToolbar
        activeReportId={reportId}
        onHighlight={handleHighlight}
        onInsertTable={handleInsertTable}
      />
      
      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-12 print:px-0 print:py-8 print:max-w-none">
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

export default ReportView;
