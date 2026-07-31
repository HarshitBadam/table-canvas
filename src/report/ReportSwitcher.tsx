import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useReportStore } from './reportStore';
import type { Report } from './types';

interface ReportSwitcherProps {
  activeReportId: string | null;
  onSelectReport?: () => void;
}

/** Rename is a report-level verb, so it is triggered from the toolbar's actions menu. */
export interface ReportSwitcherHandle {
  startRename: () => void;
}

export const ReportSwitcher = forwardRef<ReportSwitcherHandle, ReportSwitcherProps>(function ReportSwitcher(
  { activeReportId, onSelectReport },
  ref,
) {
  const reports = useReportStore((state) => state.reports);
  const selectReport = useReportStore((state) => state.selectReport);
  const updateReport = useReportStore((state) => state.updateReport);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [searchValue, setSearchValue] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const allReports = Object.values(reports);
  const reportsList = allReports
    .filter((report) => report.name.toLowerCase().includes(searchValue.trim().toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const activeReport = activeReportId ? reports[activeReportId] || null : null;
  // A chevron is only honest when there is somewhere else to go.
  const canSwitch = allReports.length > 1 || (allReports.length > 0 && !activeReport);
  const label = activeReport?.name
    || (allReports.length === 0 ? 'No reports yet' : 'Choose a report');

  useImperativeHandle(ref, () => ({
    startRename: () => {
      if (!activeReport) return;
      setRenameValue(activeReport.name);
      setMenuOpen(false);
      setIsRenaming(true);
    },
  }), [activeReport]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const focusOption = useCallback((position: 'last' | 'active') => {
    window.requestAnimationFrame(() => {
      const options = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
      );
      if (options.length === 0) return;
      if (position === 'last') {
        options.at(-1)?.focus();
        return;
      }
      (options.find(option => option.getAttribute('aria-selected') === 'true') ?? options[0])?.focus();
    });
  }, []);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
      return;
    }
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      options[(currentIndex + 1 + options.length) % options.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      options[(currentIndex - 1 + options.length) % options.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      options[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      options.at(-1)?.focus();
    }
  };

  const commitRename = () => {
    const nextName = renameValue.trim();
    setIsRenaming(false);
    if (!nextName || !activeReport || nextName === activeReport.name) return;
    // Keep the document's own H1 in sync while it still mirrors the report name.
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
  };

  const nameFieldClass = 'flex h-9 min-w-0 items-center gap-2 rounded-md border-0 bg-surface-secondary px-2.5 text-sm font-semibold sm:h-8';

  if (isRenaming && activeReport) {
    return (
      <form
        className="flex min-w-0 items-center"
        onSubmit={(event) => {
          event.preventDefault();
          commitRename();
        }}
      >
        <input
          ref={renameInputRef}
          aria-label="Report name"
          value={renameValue}
          maxLength={100}
          onChange={(event) => setRenameValue(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setIsRenaming(false);
            }
          }}
          className={`${nameFieldClass} w-[min(16rem,45vw)] text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-green`}
        />
      </form>
    );
  }

  return (
    <div ref={containerRef} className="flex min-w-0 items-center">
      <div className="relative min-w-0">
        {canSwitch ? (
          <button
            ref={triggerRef}
            type="button"
            aria-label="Switch report"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(value => !value)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              event.preventDefault();
              setMenuOpen(true);
              focusOption(event.key === 'ArrowDown' ? 'active' : 'last');
            }}
            className={`${nameFieldClass} max-w-[min(18rem,40vw)] text-left text-text-primary outline-none transition-colors hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-accent-green`}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <svg className="h-4 w-4 shrink-0 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
            </svg>
          </button>
        ) : (
          <div className={`${nameFieldClass} max-w-[min(18rem,40vw)] ${activeReport ? 'text-text-primary' : 'text-text-tertiary'}`}>
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </div>
        )}

        {menuOpen && (
          <div
            ref={menuRef}
            onKeyDown={handleMenuKeyDown}
            className="absolute left-0 top-[calc(100%+0.375rem)] z-popover w-[min(19rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-lg motion-safe:animate-scale-in"
          >
            {allReports.length > 5 && (
              <div className="border-b border-border-subtle p-2">
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search reports…"
                  className="h-9 w-full rounded-md border-0 bg-surface-secondary px-2.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-accent-green"
                />
              </div>
            )}
            <div role="listbox" aria-label="Reports" className="max-h-64 overflow-y-auto overflow-x-hidden">
              {reportsList.map((report) => {
                const active = report.id === activeReportId;
                return (
                  <button
                    key={report.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      if (!active) {
                        selectReport(report.id);
                        onSelectReport?.();
                      }
                      setMenuOpen(false);
                    }}
                    className={`flex min-h-10 w-full min-w-0 items-center px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-green ${
                      active
                        ? 'bg-accent-green/10 font-semibold text-accent-text'
                        : 'font-medium text-text-primary hover:bg-surface-secondary'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{report.name}</span>
                  </button>
                );
              })}
              {reportsList.length === 0 && (
                <div className="px-3 py-5 text-center text-xs text-text-tertiary">
                  {searchValue ? 'No matching reports' : 'No reports yet'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
