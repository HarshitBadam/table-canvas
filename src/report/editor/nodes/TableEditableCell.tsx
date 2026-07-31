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

/**
 * One cell of an editable report table, in whichever of its two states applies:
 * selected, which is a target for the keyboard, or open for editing, which is a
 * text input. Header cells behave identically — they are row -1 — so both are
 * rendered from here and cannot drift apart.
 */
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

  // Runs once per opening, not per keystroke: re-selecting on every render would
  // fight whatever the caret is doing.
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
    // Always focusable, never in the tab order: the grid moves focus itself, and
    // dropping the attribute while editing would blur the cell mid-edit.
    tabIndex: -1,
    ref: selected && !editing ? cells.focusRef : undefined,
    onMouseDownCapture: cells.handleCellMouseDown,
    onClick: (event: MouseEvent) => cells.handleCellClick(event, { row, col }),
    // A double-click is aimed at a spot in the text, so it amends rather than
    // replacing; Enter is the gesture that means "type over this".
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
