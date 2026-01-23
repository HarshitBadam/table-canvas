/**
 * ReportView Component
 * 
 * Main view for displaying and editing a report with Notion-like block-based content.
 * Clean, minimal design focused on content.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useReportStore } from './reportStore';
import { BlockEditor } from './components/BlockEditor';

// Import print styles
import './PrintStyles.css';

interface ReportViewProps {
  reportId: string;
  onOpenTable?: (tableId: string) => void;
  onExport?: () => void;
}

export function ReportView({ reportId, onOpenTable, onExport }: ReportViewProps) {
  const report = useReportStore((state) => state.reports[reportId]);
  const updateReport = useReportStore((state) => state.updateReport);
  
  const [titleValue, setTitleValue] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Sync title value when report changes
  useEffect(() => {
    if (report) {
      setTitleValue(report.name);
    }
  }, [report?.name]);

  // Auto-resize title textarea
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
  }, [titleValue]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitleValue(e.target.value);
  }, []);

  const handleTitleBlur = useCallback(() => {
    if (titleValue.trim() && titleValue !== report?.name) {
      updateReport(reportId, { name: titleValue.trim() });
    } else if (!titleValue.trim()) {
      setTitleValue(report?.name || 'Untitled');
    }
  }, [titleValue, report?.name, reportId, updateReport]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
  }, []);

  if (!report) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
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

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 report-view">
      {/* Main content area */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-16 print:px-0 print:py-8 print:max-w-none">
          {/* Editable Title - Notion style */}
          <textarea
            ref={titleRef}
            value={titleValue}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            rows={1}
            className="w-full text-4xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none resize-none placeholder:text-gray-300 dark:placeholder:text-gray-600 mb-8 leading-tight"
            style={{ overflow: 'hidden' }}
          />
          
          {/* Block Editor */}
          <BlockEditor 
            reportId={reportId} 
            blocks={report.blocks}
            onOpenTable={onOpenTable}
          />
        </div>
      </div>
    </div>
  );
}

export default ReportView;
