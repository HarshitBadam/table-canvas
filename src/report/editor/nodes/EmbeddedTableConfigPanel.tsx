import type { ColumnSchema } from '@/types';
import {
  DEFAULT_ROW_LIMIT,
  MAX_EMBEDDED_TABLE_ROWS,
  type RowSelectionMode,
} from '../tableData';
import type { EmbeddedTableNodeAttrs } from './embeddedTableTypes';

interface EmbeddedTableConfigPanelProps {
  attrs: EmbeddedTableNodeAttrs;
  columns: ColumnSchema[];
  onUpdate: (attrs: Partial<EmbeddedTableNodeAttrs>) => void;
  onColumnToggle: (columnId: string) => void;
  onChangeTable: () => void;
  onClose: () => void;
}

export function EmbeddedTableConfigPanel({
  attrs,
  columns,
  onUpdate,
  onColumnToggle,
  onChangeTable,
  onClose,
}: EmbeddedTableConfigPanelProps) {
  const selectionEmpty = !attrs.selectedColumns?.length;
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
        <label className="block-config-label">Source</label>
        <button onClick={onChangeTable} className="input text-sm w-full text-left flex items-center justify-between">
          <span>Change table…</span>
          <svg className="w-4 h-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="block-config-section">
        <label className="block-config-label">Columns</label>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {columns.map(column => (
            <label key={column.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectionEmpty || attrs.selectedColumns.includes(column.id)}
                onChange={() => onColumnToggle(column.id)}
                className="rounded border-gray-300"
              />
              {column.name}
            </label>
          ))}
        </div>
      </div>

      <div className="block-config-section">
        <label className="block-config-label">Rows</label>
        <select
          value={attrs.rowSelectionMode}
          onChange={event => onUpdate({ rowSelectionMode: event.target.value as RowSelectionMode })}
          className="input text-sm w-full"
        >
          <option value="all">Up to {MAX_EMBEDDED_TABLE_ROWS.toLocaleString()} rows</option>
          <option value="first_n">First N rows</option>
          <option value="last_n">Last N rows</option>
        </select>
        {(attrs.rowSelectionMode === 'first_n' || attrs.rowSelectionMode === 'last_n') && (
          <input
            type="number"
            value={attrs.rowLimit}
            onChange={event => onUpdate({ rowLimit: parseInt(event.target.value, 10) || DEFAULT_ROW_LIMIT })}
            min={1}
            max={1000}
            className="input text-sm w-full mt-2"
          />
        )}
      </div>

      <div className="block-config-section">
        <label className="block-config-label">Caption</label>
        <input
          type="text"
          value={attrs.caption || ''}
          onChange={event => onUpdate({ caption: event.target.value })}
          placeholder="Table caption..."
          className="input text-sm w-full"
        />
      </div>
    </div>
  );
}
