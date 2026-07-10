import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import { DimensionPicker } from './DimensionPicker';

interface EditableTableNodeAttrs {
  headers: string[];
  rows: (string | number | null)[][];
  caption?: string;
  initialized?: boolean;
}

interface EditableTableNodeOptions {
  reportId?: string;
}

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  type: 'row' | 'column' | 'cell';
  index: number;
  colIndex?: number;
}

const EditableTableNodeView = memo(function EditableTableNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const attrs = node.attrs as EditableTableNodeAttrs;
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showDimensionPicker, setShowDimensionPicker] = useState(!attrs.initialized);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleDimensionSelect = useCallback((rows: number, cols: number) => {
    const newHeaders = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
    const newRows = Array.from({ length: rows }, () => newHeaders.map(() => ''));
    updateAttributes({ headers: newHeaders, rows: newRows, initialized: true });
    setShowDimensionPicker(false);
  }, [updateAttributes]);

  const headers = useMemo(
    () => (attrs.headers.length > 0 ? attrs.headers : ['Column 1', 'Column 2', 'Column 3']),
    [attrs.headers]
  );
  const rows = useMemo(
    () => (attrs.rows.length > 0 ? attrs.rows : [['', '', ''], ['', '', ''], ['', '', '']]),
    [attrs.rows]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as globalThis.Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const handleCellClick = useCallback((rowIndex: number, colIndex: number) => {
    const value = rows[rowIndex]?.[colIndex];
    setEditValue(value !== null && value !== undefined ? String(value) : '');
    setEditingCell({ row: rowIndex, col: colIndex });
  }, [rows]);

  const handleCellBlur = useCallback(() => {
    if (editingCell && editingCell.row >= 0) {
      const newRows = rows.map(r => [...r]);
      newRows[editingCell.row][editingCell.col] = editValue;
      updateAttributes({ rows: newRows });
      setEditingCell(null);
    }
  }, [editingCell, editValue, rows, updateAttributes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellBlur();
      if (editingCell && editingCell.row >= 0 && editingCell.row < rows.length - 1) {
        const nextValue = rows[editingCell.row + 1]?.[editingCell.col];
        setEditValue(nextValue !== null && nextValue !== undefined ? String(nextValue) : '');
        setEditingCell({ row: editingCell.row + 1, col: editingCell.col });
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (editingCell) {
        if (editingCell.row === -1) {
          const newHeaders = [...headers];
          newHeaders[editingCell.col] = editValue;
          updateAttributes({ headers: newHeaders });
          if (editingCell.col < headers.length - 1) {
            setEditValue(headers[editingCell.col + 1] || '');
            setEditingCell({ row: -1, col: editingCell.col + 1 });
          } else {
            const firstCellValue = rows[0]?.[0];
            setEditValue(firstCellValue !== null && firstCellValue !== undefined ? String(firstCellValue) : '');
            setEditingCell({ row: 0, col: 0 });
          }
        } else {
          handleCellBlur();
          const nextCol = (editingCell.col + 1) % headers.length;
          const nextRow = nextCol === 0 ? editingCell.row + 1 : editingCell.row;
          if (nextRow < rows.length) {
            const nextValue = rows[nextRow]?.[nextCol];
            setEditValue(nextValue !== null && nextValue !== undefined ? String(nextValue) : '');
            setEditingCell({ row: nextRow, col: nextCol });
          } else {
            setEditingCell(null);
          }
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }, [handleCellBlur, editingCell, editValue, rows, headers, updateAttributes]);

  const handleHeaderClick = useCallback((colIndex: number) => {
    setEditValue(headers[colIndex] || '');
    setEditingCell({ row: -1, col: colIndex });
  }, [headers]);

  const handleHeaderBlur = useCallback(() => {
    if (editingCell && editingCell.row === -1) {
      const newHeaders = [...headers];
      newHeaders[editingCell.col] = editValue;
      updateAttributes({ headers: newHeaders });
      setEditingCell(null);
    }
  }, [editingCell, editValue, headers, updateAttributes]);

  const handleContextMenu = useCallback((e: React.MouseEvent, type: 'row' | 'column' | 'cell', index: number, colIndex?: number) => {
    e.preventDefault();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY, type, index, colIndex });
  }, []);

  const addRow = useCallback((atIndex?: number) => {
    const newRow = headers.map(() => '');
    const idx = atIndex !== undefined ? atIndex : rows.length;
    const newRows = [...rows.slice(0, idx), newRow, ...rows.slice(idx)];
    updateAttributes({ rows: newRows });
    setContextMenu(null);
  }, [headers, rows, updateAttributes]);

  const addColumn = useCallback((atIndex?: number) => {
    const idx = atIndex !== undefined ? atIndex : headers.length;
    const newHeaders = [...headers.slice(0, idx), `Column ${headers.length + 1}`, ...headers.slice(idx)];
    const newRows = rows.map(row => [...row.slice(0, idx), '', ...row.slice(idx)]);
    updateAttributes({ headers: newHeaders, rows: newRows });
    setContextMenu(null);
  }, [headers, rows, updateAttributes]);

  const deleteRow = useCallback((index: number) => {
    if (rows.length > 1) {
      const newRows = rows.filter((_, i) => i !== index);
      updateAttributes({ rows: newRows });
    }
    setContextMenu(null);
  }, [rows, updateAttributes]);

  const deleteColumn = useCallback((index: number) => {
    if (headers.length > 1) {
      const newHeaders = headers.filter((_, i) => i !== index);
      const newRows = rows.map(row => row.filter((_, i) => i !== index));
      updateAttributes({ headers: newHeaders, rows: newRows });
    }
    setContextMenu(null);
  }, [headers, rows, updateAttributes]);

  if (showDimensionPicker) {
    return (
      <NodeViewWrapper className="editable-table-block">
        <DimensionPicker
          onSelect={handleDimensionSelect}
          onCancel={() => {
            // Use default 3x3
            handleDimensionSelect(3, 3);
          }}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="editable-table-block">
      <div className={`editable-table-outer ${selected ? 'is-selected' : ''}`}>
        {attrs.caption && (
          <div className="editable-table-caption">{attrs.caption}</div>
        )}

        <div className="editable-table-layout">
          <div className="editable-table-container">
            <table className="editable-table">
              <thead>
                <tr>
                  {headers.map((header, colIndex) => (
                    <th
                      key={colIndex}
                      onClick={() => handleHeaderClick(colIndex)}
                      onContextMenu={(e) => handleContextMenu(e, 'column', colIndex)}
                      className={`editable-table-header ${editingCell?.row === -1 && editingCell?.col === colIndex ? 'is-editing' : ''}`}
                    >
                      {editingCell?.row === -1 && editingCell?.col === colIndex ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleHeaderBlur}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          className="editable-table-input"
                        />
                      ) : (
                        <span className="editable-table-header-text">{header}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="editable-table-row">
                    {row.map((cell, colIndex) => (
                      <td
                        key={colIndex}
                        onClick={() => handleCellClick(rowIndex, colIndex)}
                        onContextMenu={(e) => handleContextMenu(e, 'cell', rowIndex, colIndex)}
                        className={`editable-table-cell ${editingCell?.row === rowIndex && editingCell?.col === colIndex ? 'is-editing' : ''}`}
                      >
                        {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellBlur}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            className="editable-table-input"
                          />
                        ) : (
                          <span className="editable-table-cell-text">
                            {cell !== null && cell !== undefined ? String(cell) : ''}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <button
              onClick={() => addColumn()}
              className="table-add-btn table-add-col-btn"
              title="Add column"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>

        {selected && (
          <button
            onClick={() => addRow()}
            className="table-add-btn table-add-row-btn"
            title="Add row"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}

        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="table-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'column' && (
              <>
                <button onClick={() => addColumn(contextMenu.index)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Insert column left
                </button>
                <button onClick={() => addColumn(contextMenu.index + 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Insert column right
                </button>
                {headers.length > 1 && (
                  <button onClick={() => deleteColumn(contextMenu.index)} className="danger">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete column
                  </button>
                )}
              </>
            )}
            {contextMenu.type === 'cell' && (
              <>
                <button onClick={() => addRow(contextMenu.index)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Insert row above
                </button>
                <button onClick={() => addRow(contextMenu.index + 1)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Insert row below
                </button>
                {rows.length > 1 && (
                  <button onClick={() => deleteRow(contextMenu.index)} className="danger">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete row
                  </button>
                )}
                <div className="context-menu-divider" />
                {contextMenu.colIndex !== undefined && headers.length > 1 && (
                  <button onClick={() => deleteColumn(contextMenu.colIndex!)} className="danger">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete column
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
});

export const EditableTableNode = Node.create<EditableTableNodeOptions>({
  name: 'editableTable',

  group: 'block',

  atom: true,

  draggable: true,

  addOptions() {
    return {
      reportId: undefined,
    };
  },

  addAttributes() {
    return {
      headers: { default: [] },
      rows: { default: [] },
      caption: { default: '' },
      initialized: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="editable-table"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'editable-table' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditableTableNodeView);
  },
});

export default EditableTableNode;
