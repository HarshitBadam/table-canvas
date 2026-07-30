import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import {
  HEADER_ROW,
  isNavigationKey,
  moveTarget,
  type CellPosition,
} from './tableCellNavigation';

export type TableCellValue = string | number | boolean | null | undefined;

interface UseReportTableCellsOptions {
  headers: string[];
  rows: TableCellValue[][];
  updateAttributes: (attrs: Record<string, unknown>) => void;
  /** Called as the pointer enters the grid, to hand the block selection back. */
  onEnterGrid?: () => void;
  /** Escape from a selected cell steps out of the grid; the block takes over. */
  onLeaveGrid?: () => void;
}

function isTypedCharacter(event: KeyboardEvent): boolean {
  return (
    event.key.length === 1
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !event.isComposing
  );
}

/**
 * The keyboard model of a report table, which is the one the workspace grid
 * already uses: a click selects a cell, and the cell stays a plain selection
 * until you ask to edit it. Arrows then move between cells immediately, rather
 * than walking the caret through the characters of whichever cell is open, and
 * Enter toggles the two states — open the editor, then commit and go back to
 * having the cell selected.
 *
 * The selected cell holds real DOM focus, and the grid stops keystrokes from
 * propagating any further. Both matter: a table is an atomic block, so any key
 * that reaches the document is applied to the selection sitting behind the
 * block instead — which is how Backspace in a cell could reach for the block
 * itself, and how the arrows ended up scrolling the report.
 */
export function useReportTableCells({
  headers,
  rows,
  updateAttributes,
  onEnterGrid,
  onLeaveGrid,
}: UseReportTableCellsOptions) {
  const [selectedCell, setSelectedCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editValue, setEditValue] = useState('');
  // Whether opening the editor should present the value as a selection to type
  // over, which is what Enter means, or as a caret to amend.
  const [selectEditValue, setSelectEditValue] = useState(true);
  const focusRef = useRef<HTMLTableCellElement | null>(null);
  const gridRef = useRef<HTMLTableElement | null>(null);

  const bounds = useMemo(
    () => ({ rowCount: rows.length, columnCount: headers.length }),
    [headers.length, rows.length],
  );

  const readCell = useCallback((cell: CellPosition): string => {
    const value = cell.row === HEADER_ROW ? headers[cell.col] : rows[cell.row]?.[cell.col];
    return value !== null && value !== undefined ? String(value) : '';
  }, [headers, rows]);

  const writeCell = useCallback((cell: CellPosition, value: string) => {
    if (cell.row === HEADER_ROW) {
      const nextHeaders = [...headers];
      nextHeaders[cell.col] = value;
      updateAttributes({ headers: nextHeaders });
      return;
    }
    if (!rows[cell.row]) return;
    const nextRows = rows.map((row) => [...row]);
    nextRows[cell.row][cell.col] = value;
    updateAttributes({ rows: nextRows });
  }, [headers, rows, updateAttributes]);

  // Focus follows the selection, so the cell that looks active is the one
  // receiving keys. Bringing it into view is part of that: arrowing to a cell
  // below the fold has to scroll the grid, and only the grid.
  useEffect(() => {
    if (editingCell || !selectedCell) return;
    focusRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    focusRef.current?.focus({ preventScroll: true });
  }, [editingCell, selectedCell]);

  const selectCell = useCallback((cell: CellPosition) => {
    setEditingCell(null);
    setSelectedCell(cell);
  }, []);

  const beginEdit = useCallback((
    cell: CellPosition,
    options: { initialValue?: string; selectValue?: boolean } = {},
  ) => {
    setSelectedCell(cell);
    setEditValue(options.initialValue ?? readCell(cell));
    setSelectEditValue(options.selectValue ?? true);
    setEditingCell(cell);
  }, [readCell]);

  /** Writes the open editor back and leaves that cell selected. */
  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    writeCell(editingCell, editValue);
    setEditingCell(null);
    setSelectedCell(editingCell);
  }, [editValue, editingCell, writeCell]);

  const cancelEdit = useCallback(() => {
    if (!editingCell) return;
    setEditingCell(null);
    setSelectedCell(editingCell);
  }, [editingCell]);

  const leaveGrid = useCallback(() => {
    setEditingCell(null);
    setSelectedCell(null);
    onLeaveGrid?.();
  }, [onLeaveGrid]);

  /**
   * Every key pressed anywhere in the grid, taken off the document's hands.
   * Stopping propagation is what keeps ProseMirror out of it; the default action
   * is left alone, so an open editor still types, deletes and moves its caret
   * exactly like the text field it is.
   */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();

      if (editingCell) {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          commitEdit();
        } else if (event.key === 'Tab') {
          event.preventDefault();
          commitEdit();
          setSelectedCell(moveTarget('Tab', event.shiftKey, editingCell, bounds));
        }
        return;
      }

      if (!selectedCell) return;

      if (isNavigationKey(event.key)) {
        event.preventDefault();
        setSelectedCell(moveTarget(event.key, event.shiftKey, selectedCell, bounds));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        beginEdit(selectedCell);
      } else if (event.key === 'F2') {
        event.preventDefault();
        beginEdit(selectedCell, { selectValue: false });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        leaveGrid();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        writeCell(selectedCell, '');
      } else if (isTypedCharacter(event)) {
        // Typing over a selected cell replaces it, as it does in a spreadsheet.
        event.preventDefault();
        beginEdit(selectedCell, { initialValue: event.key, selectValue: false });
      }
    };

    grid.addEventListener('keydown', handleKeyDown);
    return () => grid.removeEventListener('keydown', handleKeyDown);
  }, [
    beginEdit,
    bounds,
    cancelEdit,
    commitEdit,
    editingCell,
    leaveGrid,
    selectedCell,
    writeCell,
  ]);

  /**
   * Capture-phase mousedown on a cell. The browser's default here is to focus the document's
   * contenteditable, which puts a caret in the structural paragraph after the
   * block for as long as it takes the cell to claim focus — long enough to see
   * that paragraph open up and flash its placeholder. The grid manages its own
   * focus, so that default is not wanted. Capture is also essential:
   * ProseMirror's native listener is on the editor root, below React's delegated
   * bubble listener, so stopping a bubble-phase React event cannot stop
   * ProseMirror from installing its own mouseup selection handler first.
   */
  const handleCellMouseDown = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    // An open editor still needs its clicks, to place a caret or select text.
    if (event.target instanceof Element && event.target.closest('input')) return;
    event.preventDefault();
    onEnterGrid?.();
  }, [onEnterGrid]);

  /** A click selects the cell, except when it is placing a caret in the editor. */
  const handleCellClick = useCallback((event: MouseEvent, cell: CellPosition) => {
    if (event.target instanceof Element && event.target.closest('input')) return;
    selectCell(cell);
  }, [selectCell]);

  /** Clears the selection once focus has left the grid altogether. */
  const handleCellBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof globalThis.Node && gridRef.current?.contains(next)) return;
    setSelectedCell(null);
  }, []);

  const isSelected = useCallback(
    (row: number, col: number) => selectedCell?.row === row && selectedCell?.col === col,
    [selectedCell],
  );

  const isEditing = useCallback(
    (row: number, col: number) => editingCell?.row === row && editingCell?.col === col,
    [editingCell],
  );

  return {
    selectedCell,
    editingCell,
    editValue,
    setEditValue,
    selectEditValue,
    focusRef,
    gridRef,
    isSelected,
    isEditing,
    selectCell,
    beginEdit,
    commitEdit,
    handleCellMouseDown,
    handleCellClick,
    handleCellBlur,
  };
}
