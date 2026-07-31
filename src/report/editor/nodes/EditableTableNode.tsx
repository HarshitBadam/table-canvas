import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import { DimensionPicker } from './DimensionPicker';
import { TableAddIcon } from './TableAddIcon';
import { TableContextMenu, type ContextMenuState } from './TableContextMenu';
import { TableSelectGrip } from './TableSelectGrip';
import { TableEditableCell } from './TableEditableCell';
import { HEADER_ROW } from './tableCellNavigation';
import { useNodeSelect, useReleaseNodeSelection, useSelectNode } from './useNodeSelect';
import { useReportTableCells } from './useReportTableCells';

interface EditableTableNodeAttrs {
  headers: string[];
  rows: (string | number | null)[][];
  caption?: string;
  initialized?: boolean;
}

interface EditableTableNodeOptions {
  reportId?: string;
}

const EditableTableNodeView = memo(function EditableTableNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: NodeViewProps) {
  const attrs = node.attrs as EditableTableNodeAttrs;
  // Cells own their clicks, so they can be selected and edited; the surrounding
  // chrome selects the block instead, which is how it gets deleted or dragged.
  const selectBlock = useNodeSelect(editor, getPos, 'td, th');
  const selectNode = useSelectNode(editor, getPos);
  const releaseBlockSelection = useReleaseNodeSelection(editor);
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

  const cells = useReportTableCells({
    headers,
    rows,
    updateAttributes,
    onEnterGrid: releaseBlockSelection,
    onLeaveGrid: selectNode,
  });
  const { commitEdit } = cells;

  // Grabbing the handle takes focus off the cell editor without a blur, so the
  // pending edit has to be written back before the input unmounts.
  const selectTable = useCallback(() => {
    commitEdit();
    selectNode();
  }, [commitEdit, selectNode]);

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
      <div
        onMouseDownCapture={selectBlock}
        className={`editable-table-outer ${selected ? 'is-selected' : ''} ${
          cells.selectedCell ? 'is-editing-cell' : ''
        }`}
      >
        {attrs.caption && (
          <div className="editable-table-caption">{attrs.caption}</div>
        )}

        <div className="editable-table-layout">
          <TableSelectGrip onSelect={selectTable} />
          <div className="editable-table-container">
            <table
              ref={cells.gridRef}
              className="editable-table"
              style={{ minWidth: `${headers.length * 140}px` }}
            >
              <thead>
                <tr>
                  {headers.map((header, colIndex) => (
                    <TableEditableCell
                      key={colIndex}
                      cells={cells}
                      row={HEADER_ROW}
                      col={colIndex}
                      value={header}
                      onContextMenu={(e) => handleContextMenu(e, 'column', colIndex)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="editable-table-row">
                    {row.map((cell, colIndex) => (
                      <TableEditableCell
                        key={colIndex}
                        cells={cells}
                        row={rowIndex}
                        col={colIndex}
                        value={cell !== null && cell !== undefined ? String(cell) : ''}
                        onContextMenu={(e) => handleContextMenu(e, 'cell', rowIndex, colIndex)}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => addColumn()}
            className="table-add-btn table-add-col-btn"
            title="Add column"
          >
            <TableAddIcon direction="right" />
          </button>

          {/* Anchored to the table box, not to the block: anything the block
              renders below the table must not push this off the border. */}
          <button
            onClick={() => addRow()}
            className="table-add-btn table-add-row-btn"
            title="Add row"
          >
            <TableAddIcon direction="down" />
          </button>
        </div>

        <TableContextMenu
          menu={contextMenu}
          menuRef={contextMenuRef}
          headers={headers}
          rows={rows}
          onAddRow={addRow}
          onAddColumn={addColumn}
          onDeleteRow={deleteRow}
          onDeleteColumn={deleteColumn}
        />
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
