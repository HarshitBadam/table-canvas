import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import { historyIntentFor } from '@/layout/navigation/history/historyShortcuts';
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
  /** Hand block selection back when the pointer enters the grid. */
  onEnterGrid?: () => void;
  /** Escape from a selected cell returns focus ownership to the block. */
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
 * Spreadsheet-style cell selection for report tables. Editing keys are stopped
 * from reaching the document — atomic blocks would otherwise apply them to the
 * selection behind the node (Backspace deleting the block, arrows scrolling the
 * report). Undo/redo are deliberately let through so document history still works.
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
  // Enter opens with the value selected for type-over; amend modes place a caret.
  const [selectAllOnEdit, setSelectAllOnEdit] = useState(true);
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

  // Keep DOM focus on the selected cell, scrolling only the grid into view.
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
    setSelectAllOnEdit(options.selectValue ?? true);
    setEditingCell(cell);
  }, [readCell]);

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
   * Stop grid keystrokes from reaching ProseMirror. Leave the browser default
   * alone so an open editor still types, deletes, and moves its caret.
   */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      /*
       * Undo belongs to the report, not one table. Claiming plain keys keeps an
       * atomic block from leaking them behind the node, but claiming undo left
       * nothing to act on — so undo looked broken whenever a cell was selected.
       * An open cell editor is the exception: its own undo answers until commit.
       */
      if (!editingCell && historyIntentFor(event)) return;

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
   * Capture-phase mousedown: the browser default focuses the document's
   * contenteditable, flashing the structural paragraph after the block. Capture
   * is also required because ProseMirror's native listener is on the editor root
   * below React's delegated bubble listener — stopping bubble cannot prevent PM
   * from installing its mouseup selection handler first.
   */
  const handleCellMouseDown = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    // Let clicks inside an open editor place a caret or select text.
    if (event.target instanceof Element && event.target.closest('input')) return;
    event.preventDefault();
    onEnterGrid?.();
  }, [onEnterGrid]);

  const handleCellClick = useCallback((event: MouseEvent, cell: CellPosition) => {
    if (event.target instanceof Element && event.target.closest('input')) return;
    selectCell(cell);
  }, [selectCell]);

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
    editValue,
    setEditValue,
    selectEditValue: selectAllOnEdit,
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
