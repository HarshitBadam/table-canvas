import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { HEADER_ROW } from './tableCellNavigation';
import type { useReportTableCells } from './useReportTableCells';

interface TableEditableCellProps {
  cells: ReturnType<typeof useReportTableCells>;
  row: number;
  col: number;
  value: string;
  onContextMenu: (event: MouseEvent) => void;
}

export function TableEditableCell({
  cells,
  row,
  col,
  value,
  onContextMenu,
}: TableEditableCellProps) {
  const isHeader = row === HEADER_ROW;
  const editing = cells.isEditing(row, col);
  const selected = cells.isSelected(row, col);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus/select once per open — re-running on every keystroke fights the caret.
  useEffect(() => {
    const input = inputRef.current;
    if (!editing || !input) return;
    input.focus({ preventScroll: true });
    if (cells.selectEditValue) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }, [editing, cells.selectEditValue]);

  const className = [
    isHeader ? 'editable-table-header' : 'editable-table-cell',
    editing ? 'is-editing' : '',
    selected && !editing ? 'is-selected-cell' : '',
  ].filter(Boolean).join(' ');

  const shared = {
    className,
    // Always focusable, never in the tab order: the grid moves focus itself.
    // Dropping tabIndex while editing would blur the cell mid-edit.
    tabIndex: -1,
    ref: selected && !editing ? cells.focusRef : undefined,
    onMouseDownCapture: cells.handleCellMouseDown,
    onClick: (event: MouseEvent) => cells.handleCellClick(event, { row, col }),
    // Double-click amends in place; Enter is the type-over gesture.
    onDoubleClick: () => cells.beginEdit({ row, col }, { selectValue: false }),
    onBlur: cells.handleCellBlur,
    onContextMenu,
  };

  const content = editing ? (
    <input
      ref={inputRef}
      type="text"
      value={cells.editValue}
      onChange={(event) => cells.setEditValue(event.target.value)}
      onBlur={cells.commitEdit}
      className="editable-table-input"
    />
  ) : (
    <span className={isHeader ? 'editable-table-header-text' : 'editable-table-cell-text'}>
      {value}
    </span>
  );

  return isHeader ? <th {...shared}>{content}</th> : <td {...shared}>{content}</td>;
}
