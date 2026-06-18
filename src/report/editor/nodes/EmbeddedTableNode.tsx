import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { getTableData } from '@/engine/materializationService';
import type { TableRow } from '@/state/dataStore';
import type { TableNode as TableNodeType, ColumnSchema } from '@/types';
import { TablePickerModal } from './TablePickerModal';


type RowSelectionMode = 'all' | 'first_n' | 'last_n';

interface EmbeddedTableNodeAttrs {
  sourceTableId: string;
  selectedColumns: string[];
  rowSelectionMode: RowSelectionMode;
  rowLimit: number;
  caption?: string;
}


const EmbeddedTableNodeView = memo(function EmbeddedTableNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const attrs = node.attrs as EmbeddedTableNodeAttrs;
  
  const tableNode = useProjectStore((state) => state.nodes[attrs.sourceTableId]) as TableNodeType | undefined;
  const tables = useProjectStore((state) =>
    Object.values(state.nodes).filter(
      (n): n is TableNodeType => n.kind === 'source_table' || n.kind === 'derived_table'
    )
  );

  const [showConfig, setShowConfig] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const fetchIdRef = useRef(0);

  const effectiveLimit = attrs.rowLimit || 10;

  useEffect(() => {
    if (!attrs.sourceTableId) return;

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setLoadError(undefined);

    const limit = attrs.rowSelectionMode === 'all' ? 1000 : effectiveLimit;

    getTableData(attrs.sourceTableId, 0, limit)
      .then((result) => {
        if (fetchId !== fetchIdRef.current) return;
        if (result.error) {
          setLoadError(result.error);
          setTableRows([]);
          setTotalRows(0);
        } else {
          setTableRows(result.rows);
          setTotalRows(result.totalRows);
          setLoadError(undefined);
        }
      })
      .catch((err) => {
        if (fetchId !== fetchIdRef.current) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setTableRows([]);
        setTotalRows(0);
      })
      .finally(() => {
        if (fetchId !== fetchIdRef.current) return;
        setIsLoading(false);
      });
  }, [attrs.sourceTableId, attrs.rowSelectionMode, effectiveLimit]);

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

  const displayData = useMemo(() => {
    if (attrs.rowSelectionMode === 'last_n') {
      return tableRows.slice(-effectiveLimit);
    }
    return tableRows;
  }, [tableRows, attrs.rowSelectionMode, effectiveLimit]);

  const displayColumnIds = attrs.selectedColumns.length > 0 ? attrs.selectedColumns : allColumnIds;

  const handleColumnToggle = useCallback((columnId: string) => {
    const currentlySelected = attrs.selectedColumns.length > 0
      ? attrs.selectedColumns
      : allColumnIds;

    const newColumns = currentlySelected.includes(columnId)
      ? currentlySelected.filter(c => c !== columnId)
      : [...currentlySelected, columnId];
    updateAttributes({ selectedColumns: newColumns });
  }, [attrs.selectedColumns, allColumnIds, updateAttributes]);

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
        
        {showTablePicker && (
          <TablePickerModal
            tables={tables}
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

  if (isLoading) {
    return (
      <NodeViewWrapper className="editable-table-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <div className="animate-pulse flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-accent-green border-t-transparent animate-spin" />
            <div className="block-empty-state-title">Loading Data…</div>
            <div className="block-empty-state-description">
              Materializing "{tableNode?.name || 'table'}"
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  if (loadError) {
    return (
      <NodeViewWrapper className="editable-table-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <svg className="w-8 h-8 mx-auto mb-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="block-empty-state-title">Error Loading Data</div>
          <div className="block-empty-state-description">{loadError}</div>
        </div>
      </NodeViewWrapper>
    );
  }

  if (!tableRows.length) {
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

        <div className="embedded-table-footer">
          <span>
            Showing {displayData.length} of {totalRows} rows
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


export const EmbeddedTableNode = Node.create({
  name: 'embeddedTable',
  
  group: 'block',
  
  atom: true,
  
  draggable: true,

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

