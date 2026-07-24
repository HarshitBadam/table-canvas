import { useState, useRef, useEffect, useCallback } from 'react';
import { useReportStore } from './reportStore';
import type { Report } from './types';
import { focusMenuItem } from '@/lib/focusMenuItem';

interface ReportToolbarProps {
  activeReportId: string | null;
  onHighlight?: () => void;
  onInsertTable?: () => void;
  onInsertEmbeddedTable?: () => void;
  onInsertChart?: () => void;
}


export function ReportToolbar({
  activeReportId,
  onHighlight,
  onInsertTable,
  onInsertEmbeddedTable,
  onInsertChart,
}: ReportToolbarProps) {
  const reports = useReportStore((state) => state.reports);
  const addReport = useReportStore((state) => state.addReport);
  const deleteReport = useReportStore((state) => state.deleteReport);
  const duplicateReport = useReportStore((state) => state.duplicateReport);
  const selectReport = useReportStore((state) => state.selectReport);
  const updateReport = useReportStore((state) => state.updateReport);
  const persistenceStatus = useReportStore((state) => state.persistenceStatus);
  const persistenceError = useReportStore((state) => state.persistenceError);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showReportList, setShowReportList] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const insertRef = useRef<HTMLDivElement>(null);
  const insertTriggerRef = useRef<HTMLButtonElement>(null);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const insertInitialFocusRef = useRef<'first' | 'last'>('first');

  const reportsList = Object.values(reports)
    .filter((report) => report.name.toLowerCase().includes(searchValue.trim().toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const activeReport = activeReportId ? reports[activeReportId] || null : null;

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
      if (insertRef.current && !insertRef.current.contains(e.target as Node)) {
        setShowInsertMenu(false);
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

  useEffect(() => {
    if (!showInsertMenu) return;
    const items = insertMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const index = insertInitialFocusRef.current === 'last' ? (items?.length ?? 1) - 1 : 0;
    items?.[index]?.focus();
    insertInitialFocusRef.current = 'first';
  }, [showInsertMenu]);

  const handleStartRename = () => {
    if (activeReport) {
      setEditValue(activeReport.name);
      setIsEditing(true);
      setShowReportList(false);
    }
  };

  const handleFinishRename = () => {
    if (editValue.trim() && activeReport) {
      const nextName = editValue.trim();
      const firstNode = activeReport.tiptapContent?.content?.[0];
      const firstText = firstNode?.content
        ?.map((node: { text?: string }) => node.text || '')
        .join('') || '';
      if (firstNode?.type === 'heading' && firstText === activeReport.name) {
        const tiptapContent = JSON.parse(
          JSON.stringify(activeReport.tiptapContent),
        ) as NonNullable<Report['tiptapContent']>;
        tiptapContent.content[0].content = [{ type: 'text', text: nextName }];
        updateReport(activeReport.id, { name: nextName, tiptapContent });
      } else {
        updateReport(activeReport.id, { name: nextName });
      }
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

  const handleDuplicateReport = useCallback(() => {
    if (activeReport) duplicateReport(activeReport.id);
    setShowReportList(false);
  }, [activeReport, duplicateReport]);

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

  const handleInsertMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setShowInsertMenu(false);
      window.requestAnimationFrame(() => insertTriggerRef.current?.focus());
      return;
    }
    focusMenuItem(event, insertMenuRef.current);
  };

  const handleInsertTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    insertInitialFocusRef.current = event.key === 'ArrowUp' ? 'last' : 'first';
    setShowInsertMenu(true);
  };

  return (
    <div className="report-toolbar-v2 min-w-0 max-sm:gap-1 max-sm:!px-2">
      <div className="report-toolbar-v2-left max-sm:gap-1">
        <button
          type="button"
          className="report-toolbar-v2-add max-sm:!h-10 max-sm:!w-10"
          onClick={handleCreateReport}
          title="New report"
          aria-label="New report"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <div className="report-toolbar-v2-selector min-w-0 max-sm:flex-1" ref={listRef}>
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={handleKeyDown}
              className="report-toolbar-v2-name-input max-sm:!w-full max-sm:!min-w-0"
            />
          ) : (
            <button 
              className="report-toolbar-v2-name max-sm:!max-w-full"
              onClick={() => setShowReportList(!showReportList)}
              onDoubleClick={handleStartRename}
              title="Click to switch reports, double-click to rename"
              aria-haspopup="listbox"
              aria-expanded={showReportList}
            >
              <span>{activeReport?.name || 'Select Report'}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}

          {showReportList && (
            <div className="report-toolbar-v2-list" role="listbox" aria-label="Reports">
              {activeReport && (
                <div className="report-toolbar-v2-list-actions">
                  <button type="button" onClick={handleStartRename}>Rename</button>
                  <button type="button" onClick={handleDuplicateReport}>Duplicate</button>
                </div>
              )}
              {Object.keys(reports).length > 5 && (
                <div className="px-2 pb-2">
                  <input
                    type="search"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search reports…"
                    className="input text-sm w-full"
                    autoFocus
                  />
                </div>
              )}
              {reportsList.map((report) => (
                <div
                  key={report.id}
                  className={`report-toolbar-v2-list-item ${report.id === activeReportId ? 'is-active' : ''}`}
                  onClick={() => handleSelectReport(report.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectReport(report.id);
                    }
                  }}
                  role="option"
                  aria-selected={report.id === activeReportId}
                  tabIndex={0}
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
                    aria-label={`Delete report ${report.name}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {reportsList.length === 0 && (
                <div className="report-toolbar-v2-list-empty">
                  {searchValue ? 'No matching reports' : 'No reports yet'}
                </div>
              )}
            </div>
          )}
        </div>

        {activeReport && (
          <span className="report-toolbar-v2-info">
            {wordCount > 0 ? `${wordCount.toLocaleString()} words` : 'Empty'}
          </span>
        )}
        <span
          className={persistenceStatus === 'error' ? 'text-xs text-red-600' : 'text-xs text-text-tertiary'}
          title={persistenceError || undefined}
          role="status"
          aria-live="polite"
        >
          {persistenceStatus === 'saving' && 'Saving…'}
          {persistenceStatus === 'saved' && 'Saved'}
          {persistenceStatus === 'error' && 'Save failed'}
        </span>
      </div>

      <div className="report-toolbar-v2-right shrink-0 max-sm:gap-1">
        {onHighlight && (
          <button
            type="button"
            className="report-toolbar-v2-action max-sm:!h-10 max-sm:!w-10 max-sm:!p-0"
            onClick={onHighlight}
            title="Highlight text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span className="hidden sm:inline">Highlight</span>
          </button>
        )}

        {(onInsertTable || onInsertEmbeddedTable || onInsertChart) && (
          <div
            className="report-toolbar-v2-insert"
            ref={insertRef}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget
              if (nextTarget && !event.currentTarget.contains(nextTarget as Node)) {
                setShowInsertMenu(false)
              }
            }}
          >
            <button
              ref={insertTriggerRef}
              type="button"
              className="report-toolbar-v2-action max-sm:!h-10 max-sm:!w-10 max-sm:!p-0"
              onClick={() => setShowInsertMenu((value) => !value)}
              onKeyDown={handleInsertTriggerKeyDown}
              title="Insert content"
              aria-haspopup="menu"
              aria-expanded={showInsertMenu}
              aria-controls={showInsertMenu ? 'report-insert-menu' : undefined}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="hidden sm:inline">Insert</span>
            </button>
            {showInsertMenu && (
              <div
                ref={insertMenuRef}
                id="report-insert-menu"
                className="report-toolbar-v2-insert-menu"
                role="menu"
                onKeyDown={handleInsertMenuKeyDown}
              >
                {onInsertEmbeddedTable && (
                  <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
                    onInsertEmbeddedTable();
                    setShowInsertMenu(false);
                  }}>
                    <strong>Linked table</strong>
                    <span>Live excerpt from project data</span>
                  </button>
                )}
                {onInsertChart && (
                  <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
                    onInsertChart();
                    setShowInsertMenu(false);
                  }}>
                    <strong>Chart</strong>
                    <span>Visualize a project table</span>
                  </button>
                )}
                {onInsertTable && (
                  <button type="button" role="menuitem" tabIndex={-1} onClick={() => {
                    onInsertTable();
                    setShowInsertMenu(false);
                  }}>
                    <strong>Manual table</strong>
                    <span>Small editable table in this report</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

