import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { memo } from 'react';
import { TableContextMenu } from './TableContextMenu';
import { useInlineTableEditor } from './useInlineTableEditor';

interface InlineTableNodeOptions {
  reportId?: string;
}

const InlineTableNodeView = memo(function InlineTableNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const {
    attrs,
    headers,
    rows,
    editingCell,
    editValue,
    setEditValue,
    contextMenu,
    contextMenuRef,
    handleCellClick,
    handleCellBlur,
    handleKeyDown,
    handleHeaderClick,
    handleHeaderBlur,
    handleContextMenu,
    addRow,
    addColumn,
    deleteRow,
    deleteColumn,
  } = useInlineTableEditor(node, updateAttributes);

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
      <div className={`editable-table-outer ${selected ? 'is-selected' : ''}`}>
        {attrs.caption && <div className="editable-table-caption">{attrs.caption}</div>}
        <div className="editable-table-layout">
          <div className="editable-table-container">
            <table className="editable-table">
              <thead>
                <tr>
                  {headers.map((header, columnIndex) => (
                    <th
                      key={columnIndex}
                      onClick={() => handleHeaderClick(columnIndex)}
                      onContextMenu={event => handleContextMenu(event, 'column', columnIndex)}
                      className={`editable-table-header ${
                        editingCell?.row === -1 && editingCell.col === columnIndex ? 'is-editing' : ''
                      }`}
                    >
                      {editingCell?.row === -1 && editingCell.col === columnIndex ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={event => setEditValue(event.target.value)}
                          onBlur={handleHeaderBlur}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          className="editable-table-input"
                        />
                      ) : (
                        <span className="editable-table-header-text">{header || `Column ${columnIndex + 1}`}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="editable-table-row">
                    {row.map((cell, columnIndex) => (
                      <td
                        key={columnIndex}
                        onClick={() => handleCellClick(rowIndex, columnIndex)}
                        onContextMenu={event => handleContextMenu(event, 'cell', rowIndex, columnIndex)}
                        className={`editable-table-cell ${
                          editingCell?.row === rowIndex && editingCell.col === columnIndex ? 'is-editing' : ''
                        }`}
                      >
                        {editingCell?.row === rowIndex && editingCell.col === columnIndex ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={event => setEditValue(event.target.value)}
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
            <button onClick={() => addColumn()} className="table-add-btn table-add-col-btn" title="Add column">
              <AddIcon />
            </button>
          )}
        </div>
        {selected && (
          <button onClick={() => addRow()} className="table-add-btn table-add-row-btn" title="Add row">
            <AddIcon />
          </button>
        )}
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

function AddIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

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

export default InlineTableNode;
