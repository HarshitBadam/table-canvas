import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { memo, useCallback } from 'react';
import { TableAddIcon } from './TableAddIcon';
import { TableContextMenu } from './TableContextMenu';
import { TableEditableCell } from './TableEditableCell';
import { TableSelectGrip } from './TableSelectGrip';
import { HEADER_ROW } from './tableCellNavigation';
import { useInlineTableEditor } from './useInlineTableEditor';
import { useNodeSelect, useReleaseNodeSelection, useSelectNode } from './useNodeSelect';

interface InlineTableNodeOptions {
  reportId?: string;
}

const InlineTableNodeView = memo(function InlineTableNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: NodeViewProps) {
  const selectBlock = useNodeSelect(editor, getPos, 'td, th');
  const selectNode = useSelectNode(editor, getPos);
  const releaseBlockSelection = useReleaseNodeSelection(editor);
  const {
    attrs,
    headers,
    rows,
    cells,
    contextMenu,
    contextMenuRef,
    handleContextMenu,
    addRow,
    addColumn,
    deleteRow,
    deleteColumn,
  } = useInlineTableEditor(node, updateAttributes, {
    onEnterGrid: releaseBlockSelection,
    onLeaveGrid: selectNode,
  });

  // Grabbing the handle takes focus off the cell editor without a blur, so the
  // pending edit has to be written back before the input unmounts.
  const { commitEdit } = cells;
  const selectTable = useCallback(() => {
    commitEdit();
    selectNode();
  }, [commitEdit, selectNode]);

  if (headers.length === 0) {
    return (
      <NodeViewWrapper className="editable-table-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <svg className="w-8 h-8 mx-auto mb-2 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <div className="block-empty-state-title">Empty Table</div>
          <div className="block-empty-state-description">Paste data from a table to populate</div>
        </div>
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
        {attrs.caption && <div className="editable-table-caption">{attrs.caption}</div>}
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
                  {headers.map((header, columnIndex) => (
                    <TableEditableCell
                      key={columnIndex}
                      cells={cells}
                      row={HEADER_ROW}
                      col={columnIndex}
                      value={header || `Column ${columnIndex + 1}`}
                      onContextMenu={event => handleContextMenu(event, 'column', columnIndex)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="editable-table-row">
                    {row.map((cell, columnIndex) => (
                      <TableEditableCell
                        key={columnIndex}
                        cells={cells}
                        row={rowIndex}
                        col={columnIndex}
                        value={cell !== null && cell !== undefined ? String(cell) : ''}
                        onContextMenu={event => handleContextMenu(event, 'cell', rowIndex, columnIndex)}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => addColumn()} className="table-add-btn table-add-col-btn" title="Add column">
            <TableAddIcon direction="right" />
          </button>
          <button onClick={() => addRow()} className="table-add-btn table-add-row-btn" title="Add row">
            <TableAddIcon direction="down" />
          </button>
        </div>
        {attrs.sourceInfo && (
          <div className="text-xs text-text-tertiary mt-2">From: {attrs.sourceInfo.tableName}</div>
        )}
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

export const InlineTableNode = Node.create<InlineTableNodeOptions>({
  name: 'inlineTable',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return { reportId: undefined };
  },
  addAttributes() {
    return {
      headers: { default: [] },
      rows: { default: [] },
      caption: { default: '' },
      sourceInfo: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="inline-table"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-table' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineTableNodeView);
  },
});
