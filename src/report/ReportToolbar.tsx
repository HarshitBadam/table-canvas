/**
 * ReportToolbar Component
 * 
 * Clean, structured toolbar for reports - matching Grid view style.
 * Shows report info, metadata, and actions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useReportStore } from './reportStore';
import type { Report } from './types';

interface ReportToolbarProps {
  activeReportId: string;
  onHighlight?: () => void;
  onInsertTable?: () => void;
}


export function ReportToolbar({ activeReportId, onHighlight, onInsertTable }: ReportToolbarProps) {
  const reports = useReportStore((state) => state.reports);
  const addReport = useReportStore((state) => state.addReport);
  const deleteReport = useReportStore((state) => state.deleteReport);
  const selectReport = useReportStore((state) => state.selectReport);
  const updateReport = useReportStore((state) => state.updateReport);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showReportList, setShowReportList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const reportsList = Object.values(reports).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const activeReport = reports[activeReportId] || null;

  // Count word estimate (more user-friendly than block count)
  const getWordCount = () => {
    if (!activeReport?.tiptapContent?.content) return 0;
    interface TipTapTextNode {
      text?: string;
      content?: TipTapTextNode[];
    }
    const extractText = (node: TipTapTextNode): string => {
      if (!node) return '';
      if (node.text) return node.text;
      if (node.content) return node.content.map(extractText).join(' ');
      return '';
    };
    const text = extractText(activeReport.tiptapContent as TipTapTextNode);
    return text.split(/\s+/).filter(Boolean).length;
  };
  const wordCount = getWordCount();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setShowReportList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartRename = () => {
    if (activeReport) {
      setEditValue(activeReport.name);
      setIsEditing(true);
    }
  };

  const handleFinishRename = () => {
    if (editValue.trim() && activeReport) {
      updateReport(activeReport.id, { name: editValue.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleCreateReport = useCallback(() => {
    addReport('Untitled Report');
    setShowReportList(false);
  }, [addReport]);

  const handleSelectReport = (id: string) => {
    selectReport(id);
    setShowReportList(false);
  };

  const handleDeleteReport = (report: Report, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${report.name}"?`)) {
      deleteReport(report.id);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="report-toolbar-v2">
      {/* Left Section - Report Info */}
      <div className="report-toolbar-v2-left">
        {/* New Report Button */}
        <button
          className="report-toolbar-v2-add"
          onClick={handleCreateReport}
          title="New report"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {/* Report Selector */}
        <div className="report-toolbar-v2-selector" ref={listRef}>
          {/* Current Report Name */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={handleKeyDown}
              className="report-toolbar-v2-name-input"
            />
          ) : (
            <button 
              className="report-toolbar-v2-name"
              onClick={() => setShowReportList(!showReportList)}
              onDoubleClick={handleStartRename}
              title="Click to switch reports, double-click to rename"
            >
              <span>{activeReport?.name || 'Select Report'}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}

          {/* Report List Dropdown */}
          {showReportList && (
            <div className="report-toolbar-v2-list">
              {reportsList.map((report) => (
                <div
                  key={report.id}
                  className={`report-toolbar-v2-list-item ${report.id === activeReportId ? 'is-active' : ''}`}
                  onClick={() => handleSelectReport(report.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="report-toolbar-v2-list-name">{report.name}</span>
                  {report.id === activeReportId && (
                    <svg className="report-toolbar-v2-list-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                  <button
                    className="report-toolbar-v2-list-delete"
                    onClick={(e) => handleDeleteReport(report, e)}
                    title="Delete report"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {reportsList.length === 0 && (
                <div className="report-toolbar-v2-list-empty">
                  No reports yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* Document Badge */}
        <span className="report-toolbar-v2-badge">
          Document
        </span>

        {/* Info Text */}
        {activeReport && (
          <span className="report-toolbar-v2-info">
            {wordCount > 0 ? `${wordCount.toLocaleString()} words` : 'Empty'} · Updated {formatDate(activeReport.updatedAt)}
          </span>
        )}
      </div>

      {/* Right Section - Actions */}
      <div className="report-toolbar-v2-right">
        {onHighlight && (
          <button
            className="report-toolbar-v2-action"
            onClick={onHighlight}
            title="Highlight text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Highlight</span>
          </button>
        )}

        {onInsertTable && (
          <button
            className="report-toolbar-v2-action"
            onClick={onInsertTable}
            title="Insert table"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            <span>Table</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default ReportToolbar;
