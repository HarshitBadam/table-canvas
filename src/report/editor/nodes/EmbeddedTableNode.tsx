/**
 * EmbeddedTableNode - TipTap Custom Node for Embedded Tables
 *
 * Renders a live snapshot of a workspace table (source or derived) with
 * configurable column and row selection. Data is read through the shared
 * `useTableSource` hook, which guarantees the underlying table is
 * materialized before it is displayed.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, memo } from 'react';
import type { ColumnSchema } from '@/lib/types';
import {
  useTableSource,
  selectRows,
  resolveDisplayColumns,
  toggleColumnSelection,
  DEFAULT_ROW_LIMIT,
  type RowSelectionMode,
} from '../tableData';
import { TablePickerModal } from './TablePickerModal';

// ============================================================================
// Types
// ============================================================================

interface EmbeddedTableNodeAttrs {
  sourceTableId: string;
  selectedColumns: string[];
  rowSelectionMode: RowSelectionMode;
  rowLimit: number;
  caption?: string;
}

interface EmbeddedTableNodeOptions {
  reportId?: string;
  onOpenTable?: (tableId: string) => void;
}

// ============================================================================
// Shared block chrome
// ============================================================================

const TableGlyph = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

function EmptyState({
  selected,
  title,
  description,
  onClick,
  spinning,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick?: () => void;
  spinning?: boolean;
}) {
  return (
    <div
      className={`block-empty-state ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {spinning ? (
        <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      ) : (
        <TableGlyph />
      )}
      <div className="block-empty-state-title">{title}</div>
      <div className="block-empty-state-description">{description}</div>
    </div>
  );
}

// ============================================================================
// Node View
// ============================================================================

const EmbeddedTableNodeView = memo(function EmbeddedTableNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const attrs = node.attrs as EmbeddedTableNodeAttrs;

  const { tableNode, columns, rows, rowCount, status } = useTableSource(attrs.sourceTableId);

  const [showConfig, setShowConfig] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const displayColumns = useMemo(
    () => resolveDisplayColumns(attrs.selectedColumns, columns),
    [attrs.selectedColumns, columns]
  );

  const displayRows = useMemo(
    () => selectRows(rows, attrs.rowSelectionMode || 'first_n', attrs.rowLimit ?? DEFAULT_ROW_LIMIT),
    [rows, attrs.rowSelectionMode, attrs.rowLimit]
  );

  const allColumnIds = useMemo(() => columns.map((c) => c.id), [columns]);

  const handleColumnToggle = useCallback(
    (columnId: string) => {
      updateAttributes({
        selectedColumns: toggleColumnSelection(attrs.selectedColumns || [], allColumnIds, columnId),
      });
    },
    [attrs.selectedColumns, allColumnIds, updateAttributes]
  );

  const handleSelectTable = useCallback(
    (tableId: string) => {
      // Reset column selection so the new table shows all of its columns.
      updateAttributes({ sourceTableId: tableId, selectedColumns: [] });
      setShowPicker(false);
    },
    [updateAttributes]
  );

  const picker = showPicker ? (
    <TablePickerModal
      title="Select a table to embed"
      onSelect={handleSelectTable}
      onClose={() => setShowPicker(false)}
    />
  ) : null;

  // ---- No source selected -------------------------------------------------
  if (status === 'no-source') {
    return (
      <NodeViewWrapper className="editable-table-block">
        <EmptyState
          selected={selected}
          title="Embed Table"
          description="Click to select a table from your workspace"
          onClick={() => setShowPicker(true)}
        />
        {picker}
      </NodeViewWrapper>
    );
  }

  // ---- Source missing -----------------------------------------------------
  if (status === 'missing-table') {
    return (
      <NodeViewWrapper className="editable-table-block">
        <EmptyState
          selected={selected}
          title="Table not found"
          description="The linked table was removed. Click to pick another."
          onClick={() => setShowPicker(true)}
        />
        {picker}
      </NodeViewWrapper>
    );
  }

  // ---- Loading ------------------------------------------------------------
  if (status === 'loading') {
    return (
      <NodeViewWrapper className="editable-table-block">
        <EmptyState
          selected={selected}
          spinning
          title="Loading data…"
          description={tableNode ? `Preparing "${tableNode.name}"` : 'Preparing table'}
        />
      </NodeViewWrapper>
    );
  }

  // ---- Error / no data ----------------------------------------------------
  if (status === 'error' || status === 'empty') {
    return (
      <NodeViewWrapper className="editable-table-block">
        <EmptyState
          selected={selected}
          title={status === 'error' ? 'Could not load data' : 'No Data'}
          description={
            tableNode
              ? status === 'error'
                ? `"${tableNode.name}" failed to load. Click to pick another table.`
                : `"${tableNode.name}" has no rows yet.`
              : 'Table not available'
          }
          onClick={() => setShowPicker(true)}
        />
        {picker}
      </NodeViewWrapper>
    );
  }

  // ---- Ready --------------------------------------------------------------
  return (
    <NodeViewWrapper className="editable-table-block">
      <div className={`embedded-table-window ${selected ? 'is-selected' : ''}`}>
        {/* Window Header */}
        <div className="embedded-table-header">
          <div className="embedded-table-title">
            <TableGlyph className="w-4 h-4" />
            <span>{tableNode?.name || 'Table'}</span>
            {attrs.caption && (
              <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
                — {attrs.caption}
              </span>
            )}
          </div>
          <span className="embedded-table-badge">
            {tableNode?.kind === 'source_table' ? 'Source' : 'Derived'}
          </span>
        </div>

        {/* Scrollable Table Content */}
        <div className="embedded-table-scroll">
          <table className="editable-table">
            <thead>
              <tr>
                {displayColumns.map((col) => (
                  <th key={col.id} className="editable-table-header">
                    <span className="editable-table-header-text">{col.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.__rowId} className="editable-table-row">
                  {displayColumns.map((col) => {
                    const value = row[col.id];
                    return (
                      <td key={col.id} className="editable-table-cell">
                        <span className="editable-table-cell-text">
                          {value !== undefined && value !== null ? String(value) : ''}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="embedded-table-footer">
          <span>
            Showing {displayRows.length} of {rowCount} rows
          </span>
          {selected && (
            <button onClick={() => setShowConfig((v) => !v)} className="embedded-table-config-btn">
              Configure
            </button>
          )}
        </div>

        {/* Config Panel */}
        {showConfig && (
          <TableConfigPanel
            attrs={attrs}
            columns={columns}
            onUpdate={updateAttributes}
            onColumnToggle={handleColumnToggle}
            onChangeTable={() => {
              setShowConfig(false);
              setShowPicker(true);
            }}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
      {picker}
    </NodeViewWrapper>
  );
});

// ============================================================================
// Config Panel
// ============================================================================

interface TableConfigPanelProps {
  attrs: EmbeddedTableNodeAttrs;
  columns: ColumnSchema[];
  onUpdate: (attrs: Partial<EmbeddedTableNodeAttrs>) => void;
  onColumnToggle: (columnId: string) => void;
  onChangeTable: () => void;
  onClose: () => void;
}

function TableConfigPanel({
  attrs,
  columns,
  onUpdate,
  onColumnToggle,
  onChangeTable,
  onClose,
}: TableConfigPanelProps) {
  const selectionEmpty = !attrs.selectedColumns || attrs.selectedColumns.length === 0;

  return (
    <div className="block-config-panel">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-sm">Table Configuration</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Source table */}
      <div className="block-config-section">
        <label className="block-config-label">Source</label>
        <button
          onClick={onChangeTable}
          className="input text-sm w-full text-left flex items-center justify-between"
        >
          <span>Change table…</span>
          <svg className="w-4 h-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Columns */}
      <div className="block-config-section">
        <label className="block-config-label">Columns</label>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {columns.map((col) => (
            <label key={col.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectionEmpty || attrs.selectedColumns.includes(col.id)}
                onChange={() => onColumnToggle(col.id)}
                className="rounded border-gray-300"
              />
              {col.name}
            </label>
          ))}
        </div>
      </div>

      {/* Row Selection */}
      <div className="block-config-section">
        <label className="block-config-label">Rows</label>
        <select
          value={attrs.rowSelectionMode}
          onChange={(e) => onUpdate({ rowSelectionMode: e.target.value as RowSelectionMode })}
          className="input text-sm w-full"
        >
          <option value="all">All rows</option>
          <option value="first_n">First N rows</option>
          <option value="last_n">Last N rows</option>
        </select>

        {(attrs.rowSelectionMode === 'first_n' || attrs.rowSelectionMode === 'last_n') && (
          <input
            type="number"
            value={attrs.rowLimit}
            onChange={(e) => onUpdate({ rowLimit: parseInt(e.target.value, 10) || DEFAULT_ROW_LIMIT })}
            min={1}
            max={1000}
            className="input text-sm w-full mt-2"
          />
        )}
      </div>

      {/* Caption */}
      <div className="block-config-section">
        <label className="block-config-label">Caption</label>
        <input
          type="text"
          value={attrs.caption || ''}
          onChange={(e) => onUpdate({ caption: e.target.value })}
          placeholder="Table caption..."
          className="input text-sm w-full"
        />
      </div>
    </div>
  );
}

// ============================================================================
// TipTap Node Definition
// ============================================================================

export const EmbeddedTableNode = Node.create<EmbeddedTableNodeOptions>({
  name: 'embeddedTable',

  group: 'block',

  atom: true,

  draggable: true,

  addOptions() {
    return {
      reportId: undefined,
      onOpenTable: undefined,
    };
  },

  addAttributes() {
    return {
      sourceTableId: { default: '' },
      selectedColumns: { default: [] },
      rowSelectionMode: { default: 'first_n' },
      rowLimit: { default: DEFAULT_ROW_LIMIT },
      caption: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embedded-table"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'embedded-table' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbeddedTableNodeView);
  },
});

export default EmbeddedTableNode;
