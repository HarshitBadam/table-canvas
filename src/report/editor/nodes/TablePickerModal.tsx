/**
 * TablePickerModal - shared table selector for report data blocks.
 *
 * Used by both the embedded-table and chart nodes so table selection behaves
 * identically everywhere. Lists source and derived tables from the workspace.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useSelectableTables } from '../tableData';

interface TablePickerModalProps {
  title?: string;
  subtitle?: string;
  onSelect: (tableId: string) => void;
  onClose: () => void;
}

export const TablePickerModal = memo(function TablePickerModal({
  title = 'Select a Table',
  subtitle,
  onSelect,
  onClose,
}: TablePickerModalProps) {
  const tables = useSelectableTables();
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const visibleTables = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tables;
    return tables.filter((table) => table.name.toLowerCase().includes(normalizedQuery));
  }, [query, tables]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="table-picker-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="table-picker-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-picker-title"
        tabIndex={-1}
      >
        <div className="table-picker-header">
          <div>
            <h3 id="table-picker-title">{title}</h3>
            {subtitle && <p className="table-picker-item-meta">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="table-picker-close" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="table-picker-content">
          {tables.length > 5 && (
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tables…"
              className="input text-sm w-full mb-3"
              autoFocus
            />
          )}
          {tables.length === 0 ? (
            <div className="table-picker-empty">
              <p>No tables available</p>
              <p className="text-xs text-text-tertiary">Import or create a table first to embed it here</p>
            </div>
          ) : (
            <div className="table-picker-list">
              {visibleTables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => onSelect(table.id)}
                  className="table-picker-item"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <div className="table-picker-item-info">
                    <span className="table-picker-item-name">{table.name}</span>
                    <span className="table-picker-item-meta">
                      {(table.schema?.rowCount ?? 0).toLocaleString()} rows ·{' '}
                      {table.schema?.columns?.length ?? 0} columns
                    </span>
                  </div>
                  <span className="table-picker-item-badge">
                    {table.kind === 'source_table' ? 'SOURCE' : 'DERIVED'}
                  </span>
                </button>
              ))}
              {visibleTables.length === 0 && (
                <div className="table-picker-empty">
                  <p>No matching tables</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
