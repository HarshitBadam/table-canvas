import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, memo } from 'react';
import {
  useTableSource,
  selectRows,
  resolveDisplayColumns,
  toggleColumnSelection,
  DEFAULT_ROW_LIMIT,
} from '../tableData';
import { TablePickerModal } from './TablePickerModal';
import { EmbeddedTableConfigPanel } from './EmbeddedTableConfigPanel';
import type { EmbeddedTableNodeAttrs, EmbeddedTableNodeOptions } from './embeddedTableTypes';

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

  return (
    <NodeViewWrapper className="editable-table-block">
      <div className={`embedded-table-window ${selected ? 'is-selected' : ''}`}>
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

        {showConfig && (
          <EmbeddedTableConfigPanel
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
