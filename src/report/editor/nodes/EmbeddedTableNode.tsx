/**
 * EmbeddedTableNode - TipTap Custom Node for Embedded Tables
 * 
 * Renders table snippets from source tables with configuration.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, memo } from 'react';
import { useDataStore } from '@/state/dataStore';
import { useProjectStore } from '@/state/projectStore';
import type { TableNode as TableNodeType, ColumnSchema } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

type RowSelectionMode = 'all' | 'first_n' | 'last_n';

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
// React Component
// ============================================================================

const EmbeddedTableNodeView = memo(function EmbeddedTableNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const attrs = node.attrs as EmbeddedTableNodeAttrs;
  
  const tableDataEntry = useDataStore((state) => state.tableData[attrs.sourceTableId]);
  const tableData = tableDataEntry?.rows || [];
  const tableNode = useProjectStore((state) => state.nodes[attrs.sourceTableId]) as TableNodeType | undefined;
  
  const [showConfig, setShowConfig] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);

  // Get columns from schema
  const schemaColumns: ColumnSchema[] = useMemo(() => {
    return tableNode?.schema?.columns || [];
  }, [tableNode]);

  const allColumnIds = useMemo(() => {
    return schemaColumns.map(c => c.id);
  }, [schemaColumns]);

  const columnNames = useMemo(() => {
    const map: Record<string, string> = {};
    schemaColumns.forEach(c => {
      map[c.id] = c.name;
    });
    return map;
  }, [schemaColumns]);

  // Filter and slice data
  const displayData = useMemo(() => {
    let data = tableData;
    const limit = attrs.rowLimit || 10;
    
    if (attrs.rowSelectionMode === 'first_n' && limit) {
      data = data.slice(0, limit);
    } else if (attrs.rowSelectionMode === 'last_n' && limit) {
      data = data.slice(-limit);
    }
    
    return data;
  }, [tableData, attrs.rowSelectionMode, attrs.rowLimit]);

  const displayColumnIds = attrs.selectedColumns.length > 0 ? attrs.selectedColumns : allColumnIds;

  const handleColumnToggle = useCallback((columnId: string) => {
    const newColumns = attrs.selectedColumns.includes(columnId)
      ? attrs.selectedColumns.filter(c => c !== columnId)
      : [...attrs.selectedColumns, columnId];
    updateAttributes({ selectedColumns: newColumns });
  }, [attrs.selectedColumns, updateAttributes]);

  // No source table - empty state with popup
  if (!attrs.sourceTableId) {
    return (
      <NodeViewWrapper className="editable-table-block">
        <div 
          className={`block-empty-state ${selected ? 'is-selected' : ''}`}
          onClick={() => setShowTablePicker(true)}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3zm0 5h16M9 4v16" />
          </svg>
          <div className="block-empty-state-title">Embed Table</div>
          <div className="block-empty-state-description">
            Click to select a table from your workspace
          </div>
        </div>
        
        {/* Table Picker Modal */}
        {showTablePicker && (
          <TablePickerModal 
            onSelect={(tableId) => {
              updateAttributes({ sourceTableId: tableId });
              setShowTablePicker(false);
            }}
            onClose={() => setShowTablePicker(false)}
          />
        )}
      </NodeViewWrapper>
    );
  }

  // No data state
  if (!tableData.length) {
    return (
      <NodeViewWrapper className="editable-table-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <svg className="w-8 h-8 mx-auto mb-2 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <div className="block-empty-state-title">No Data</div>
          <div className="block-empty-state-description">
            {tableNode ? `No data in "${tableNode.name}"` : 'Table not found'}
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="editable-table-block">
      <div className={`embedded-table-window ${selected ? 'is-selected' : ''}`}>
        {/* Window Header */}
        <div className="embedded-table-header">
          <div className="embedded-table-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>{tableNode?.name || 'Table'}</span>
            {attrs.caption && <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>— {attrs.caption}</span>}
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
                {displayColumnIds.map(colId => (
                  <th key={colId} className="editable-table-header">
                    <span className="editable-table-header-text">{columnNames[colId] || colId}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayData.map((row, i) => (
                <tr key={i} className="editable-table-row">
                  {displayColumnIds.map(colId => (
                    <td key={colId} className="editable-table-cell">
                      <span className="editable-table-cell-text">
                        {row[colId] !== undefined && row[colId] !== null 
                          ? String(row[colId]) 
                          : ''}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="embedded-table-footer">
          <span>
            Showing {displayData.length} of {tableData.length} rows
          </span>
          {selected && (
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="embedded-table-config-btn"
            >
              Configure
            </button>
          )}
        </div>

        {/* Config Panel */}
        {showConfig && (
          <TableConfigPanel
            attrs={attrs}
            columns={schemaColumns}
            onUpdate={updateAttributes}
            onColumnToggle={handleColumnToggle}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
});

// ============================================================================
// Table Selector Component
// ============================================================================

// ============================================================================
// Table Picker Modal
// ============================================================================

function TablePickerModal({ onSelect, onClose }: { onSelect: (tableId: string) => void; onClose: () => void }) {
  const nodes = useProjectStore((state) => state.nodes);
  const tables = Object.values(nodes).filter(
    n => n.kind === 'source_table' || n.kind === 'derived_table'
  ) as TableNodeType[];

  return (
    <div className="table-picker-overlay" onClick={onClose}>
      <div className="table-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="table-picker-header">
          <h3>Select a Table</h3>
          <button onClick={onClose} className="table-picker-close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="table-picker-content">
          {tables.length === 0 ? (
            <div className="table-picker-empty">
              <p>No tables available</p>
              <p className="text-xs text-text-tertiary">Create a table first to embed it here</p>
            </div>
          ) : (
            <div className="table-picker-list">
              {tables.map(table => (
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
                      {table.kind === 'source_table' ? 'Source Table' : 'Derived Table'}
                    </span>
                  </div>
                  <span className="table-picker-item-badge">
                    {table.kind === 'source_table' ? 'SOURCE' : 'DERIVED'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Config Panel
// ============================================================================

interface TableConfigPanelProps {
  attrs: EmbeddedTableNodeAttrs;
  columns: ColumnSchema[];
  onUpdate: (attrs: Partial<EmbeddedTableNodeAttrs>) => void;
  onColumnToggle: (columnId: string) => void;
  onClose: () => void;
}

function TableConfigPanel({
  attrs,
  columns,
  onUpdate,
  onColumnToggle,
  onClose,
}: TableConfigPanelProps) {
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

      {/* Columns */}
      <div className="block-config-section">
        <label className="block-config-label">Columns</label>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {columns.map(col => (
            <label key={col.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={attrs.selectedColumns.length === 0 || attrs.selectedColumns.includes(col.id)}
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
            onChange={(e) => onUpdate({ rowLimit: parseInt(e.target.value) || 10 })}
            min={1}
            max={100}
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
      rowLimit: { default: 10 },
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
