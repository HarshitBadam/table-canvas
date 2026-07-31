import { useDialogFocus } from '@/components/useDialogFocus';
import type { ColumnSchema } from '@/types';
import {
  DEFAULT_ROW_LIMIT,
  MAX_EMBEDDED_TABLE_ROWS,
  type RowSelectionMode,
} from '../tableData';
import { BlockConfigSelect, type BlockConfigOption } from './BlockConfigSelect';
import type { EmbeddedTableNodeAttrs } from './embeddedTableTypes';
import { useRevealPanel } from './useRevealPanel';

interface EmbeddedTableConfigPanelProps {
  attrs: EmbeddedTableNodeAttrs;
  columns: ColumnSchema[];
  sourceName?: string;
  onUpdate: (attrs: Partial<EmbeddedTableNodeAttrs>) => void;
  onColumnToggle: (columnId: string) => void;
  onChangeTable: () => void;
  onClose: () => void;
}

export function EmbeddedTableConfigPanel({
  attrs,
  columns,
  sourceName,
  onUpdate,
  onColumnToggle,
  onChangeTable,
  onClose,
}: EmbeddedTableConfigPanelProps) {
  const panelRef = useDialogFocus<HTMLDivElement>(true, onClose);
  useRevealPanel(panelRef);

  const selectionEmpty = !attrs.selectedColumns?.length;
  const showRowLimit = attrs.rowSelectionMode === 'first_n' || attrs.rowSelectionMode === 'last_n';
  const includedCount = selectionEmpty ? columns.length : attrs.selectedColumns.length;
  const rowModes: BlockConfigOption[] = [
    { value: 'all', label: `Up to ${MAX_EMBEDDED_TABLE_ROWS.toLocaleString()} rows` },
    { value: 'first_n', label: 'First N rows' },
    { value: 'last_n', label: 'Last N rows' },
  ];

  return (
    <div
      ref={panelRef}
      className="block-config-panel"
      role="dialog"
      aria-label="Table configuration"
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="block-config-header">
        <div className="block-config-header-text">
          <h2>Configure Table</h2>
          <p>
            {sourceName
              ? <>Showing data from <strong>{sourceName}</strong>.</>
              : 'Choose what this table shows.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="block-config-close"
          aria-label="Close table configuration"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="block-config-body">
        <section className="block-config-section">
          <h3>Columns to Include</h3>
          {columns.length === 0 ? (
            <p className="block-config-empty">This table has no columns.</p>
          ) : (
            <>
              <div className="block-config-options-scroll">
                <div className="block-config-options">
                  {columns.map((column) => {
                    const included = selectionEmpty || attrs.selectedColumns.includes(column.id);
                    return (
                      <button
                        key={column.id}
                        type="button"
                        role="switch"
                        aria-checked={included}
                        onClick={() => onColumnToggle(column.id)}
                        className={`block-config-option ${included ? 'active' : ''}`}
                      >
                        <span className="block-config-option-info">
                          <span className="block-config-option-name">{column.name}</span>
                          <span className="block-config-option-desc">{column.type}</span>
                        </span>
                        <span className="block-config-option-check" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectionEmpty && (
                <p className="block-config-note">
                  All columns are shown until you narrow the selection.
                </p>
              )}
            </>
          )}
        </section>

        <section className="block-config-section">
          <h3>Rows</h3>
          <div className="block-config-fields">
            <div className="block-config-field">
              <span className="block-config-field-label">How many</span>
              <BlockConfigSelect
                value={attrs.rowSelectionMode}
                options={rowModes}
                onChange={(mode) => onUpdate({ rowSelectionMode: mode as RowSelectionMode })}
                ariaLabel="Row selection mode"
              />
            </div>
            {showRowLimit && (
              <div className="block-config-field">
                <span className="block-config-field-label">Row count</span>
                <input
                  type="number"
                  aria-label="Number of rows"
                  value={attrs.rowLimit}
                  onChange={(event) => onUpdate({
                    rowLimit: parseInt(event.target.value, 10) || DEFAULT_ROW_LIMIT,
                  })}
                  min={1}
                  max={1000}
                  className="block-config-input"
                />
              </div>
            )}
          </div>
        </section>

        <section className="block-config-section">
          <h3>Display</h3>
          <label className="block-config-subsection-label" htmlFor="table-config-caption">
            Caption
          </label>
          <input
            id="table-config-caption"
            type="text"
            value={attrs.caption || ''}
            onChange={(event) => onUpdate({ caption: event.target.value })}
            placeholder="Enter a table caption"
            className="block-config-input"
          />
          <p className="block-config-note">Shown below the table in the report and exported PDF.</p>
        </section>

        <section className="block-config-section">
          <h3>Data Source</h3>
          <button type="button" onClick={onChangeTable} className="block-config-select-btn">
            <span className="block-config-select-value">{sourceName ?? 'Select a table'}</span>
            <span className="block-config-select-meta">Change</span>
            <svg className="block-config-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </section>
      </div>

      <div className="block-config-footer">
        <span className="block-config-footer-summary">
          {includedCount} {includedCount === 1 ? 'column' : 'columns'} shown
        </span>
        <button type="button" onClick={onClose} className="block-config-btn-done">
          Done
        </button>
      </div>
    </div>
  );
}
