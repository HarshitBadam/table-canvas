/**
 * useGridSelection Hook
 * 
 * Handles cell, row, and column selection including rectangular range selection.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ColumnSchema } from '@/lib/types';

// Selection types
export type SelectionType =
  | { type: 'cell'; rowIndex: number; columnId: string }
  | { type: 'row'; rowIndex: number }
  | { type: 'column'; columnId: string }
  | { type: 'header-row' }
  | { type: 'index-column' }
  | { type: 'corner' }
  | null;

// Rectangular cell range selection
export interface CellRangeSelection {
  startRow: number;
  endRow: number;
  startColIndex: number;
  endColIndex: number;
}

export interface GridSelectionConfig {
  columns: ColumnSchema[];
  totalRows: number;
}

export interface GridSelectionState {
  selection: SelectionType;
  setSelection: (selection: SelectionType) => void;
  cellRangeSelection: CellRangeSelection | null;
  setCellRangeSelection: (range: CellRangeSelection | null) => void;
  
  // Derived selection state
  selectedCell: { rowIndex: number; columnId: string } | null;
  selectedColumn: string | null;
  isHeaderRowSelected: boolean;
  isIndexColumnSelected: boolean;
  isCornerSelected: boolean;
  
  // Event handlers
  handleCellMouseDown: (rowIndex: number, columnId: string, e: React.MouseEvent) => void;
  handleCellMouseEnter: (rowIndex: number, columnId: string) => void;
  handleSelectionMouseUp: () => void;
  handleColumnClick: (columnId: string) => void;
  handleRowClick: (rowIndex: number) => void;
  handleCornerClick: () => void;
  
  // Insertion position helpers
  getRowInsertionIndex: () => number;
  getColumnInsertionIndex: () => number;
  
  // Cell range helpers
  isCellInRange: (rowIndex: number, colIndex: number) => boolean;
  getSelectionEdges: (rowIndex: number, colIndex: number) => {
    isTop: boolean;
    isBottom: boolean;
    isLeft: boolean;
    isRight: boolean;
  };
}

export function useGridSelection({
  columns,
  totalRows,
}: GridSelectionConfig): GridSelectionState {
  const [selection, setSelection] = useState<SelectionType>(null);
  const [cellRangeSelection, setCellRangeSelection] = useState<CellRangeSelection | null>(null);
  
  // Drag selection refs
  const isDraggingSelectionRef = useRef(false);
  const dragSelectionStart = useRef<{ rowIndex: number; colIndex: number } | null>(null);

  // Derived selection state
  const selectedCell =
    selection?.type === 'cell'
      ? { rowIndex: selection.rowIndex, columnId: selection.columnId }
      : null;
  const selectedColumn =
    selection?.type === 'column'
      ? selection.columnId
      : selection?.type === 'cell'
      ? selection.columnId
      : null;
  const isHeaderRowSelected = selection?.type === 'header-row' || selection?.type === 'corner';
  const isIndexColumnSelected = selection?.type === 'index-column' || selection?.type === 'corner';
  const isCornerSelected = selection?.type === 'corner';

  // Cell mouse down - start selection
  const handleCellMouseDown = useCallback(
    (rowIndex: number, columnId: string, e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      
      const colIndex = columns.findIndex((c) => c.id === columnId);
      isDraggingSelectionRef.current = true;
      dragSelectionStart.current = { rowIndex, colIndex };
      setSelection({ type: 'cell', rowIndex, columnId });
      setCellRangeSelection(null);
    },
    [columns]
  );

  // Cell mouse enter - extend selection
  const handleCellMouseEnter = useCallback(
    (rowIndex: number, columnId: string) => {
      if (!isDraggingSelectionRef.current || !dragSelectionStart.current) return;
      
      const colIndex = columns.findIndex((c) => c.id === columnId);
      const startRow = Math.min(dragSelectionStart.current.rowIndex, rowIndex);
      const endRow = Math.max(dragSelectionStart.current.rowIndex, rowIndex);
      const startColIndex = Math.min(dragSelectionStart.current.colIndex, colIndex);
      const endColIndex = Math.max(dragSelectionStart.current.colIndex, colIndex);

      if (startRow !== endRow || startColIndex !== endColIndex) {
        setCellRangeSelection({ startRow, endRow, startColIndex, endColIndex });
      } else {
        setCellRangeSelection(null);
      }
    },
    [columns]
  );

  // Mouse up - end selection
  const handleSelectionMouseUp = useCallback(() => {
    isDraggingSelectionRef.current = false;
    dragSelectionStart.current = null;
  }, []);

  // Global mouse up listener
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDraggingSelectionRef.current) {
        handleSelectionMouseUp();
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleSelectionMouseUp]);

  // Column header click
  const handleColumnClick = useCallback((columnId: string) => {
    setSelection({ type: 'column', columnId });
    setCellRangeSelection(null);
  }, []);

  // Row number click
  const handleRowClick = useCallback((rowIndex: number) => {
    setSelection({ type: 'row', rowIndex });
    setCellRangeSelection(null);
  }, []);

  // Corner click
  const handleCornerClick = useCallback(() => {
    setSelection({ type: 'corner' });
    setCellRangeSelection(null);
  }, []);

  // Get row insertion index based on selection
  const getRowInsertionIndex = useCallback((): number => {
    if (!selection) return totalRows;
    switch (selection.type) {
      case 'cell':
        return selection.rowIndex + 1;
      case 'row':
        return selection.rowIndex + 1;
      case 'header-row':
      case 'corner':
        return 0;
      default:
        return totalRows;
    }
  }, [selection, totalRows]);

  // Get column insertion index based on selection
  const getColumnInsertionIndex = useCallback((): number => {
    if (!selection) return columns.length;
    switch (selection.type) {
      case 'cell': {
        const idx = columns.findIndex((c) => c.id === selection.columnId);
        return idx >= 0 ? idx + 1 : columns.length;
      }
      case 'column': {
        const idx = columns.findIndex((c) => c.id === selection.columnId);
        return idx >= 0 ? idx + 1 : columns.length;
      }
      case 'index-column':
      case 'corner':
      case 'row':
        return 0;
      default:
        return columns.length;
    }
  }, [selection, columns]);

  // Check if a cell is in the current range selection
  const isCellInRange = useCallback(
    (rowIndex: number, colIndex: number): boolean => {
      if (!cellRangeSelection) return false;
      return (
        rowIndex >= cellRangeSelection.startRow &&
        rowIndex <= cellRangeSelection.endRow &&
        colIndex >= cellRangeSelection.startColIndex &&
        colIndex <= cellRangeSelection.endColIndex
      );
    },
    [cellRangeSelection]
  );

  // Get selection edge flags for border styling
  const getSelectionEdges = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (!cellRangeSelection) {
        return { isTop: false, isBottom: false, isLeft: false, isRight: false };
      }
      return {
        isTop: rowIndex === cellRangeSelection.startRow,
        isBottom: rowIndex === cellRangeSelection.endRow,
        isLeft: colIndex === cellRangeSelection.startColIndex,
        isRight: colIndex === cellRangeSelection.endColIndex,
      };
    },
    [cellRangeSelection]
  );

  return {
    selection,
    setSelection,
    cellRangeSelection,
    setCellRangeSelection,
    selectedCell,
    selectedColumn,
    isHeaderRowSelected,
    isIndexColumnSelected,
    isCornerSelected,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleSelectionMouseUp,
    handleColumnClick,
    handleRowClick,
    handleCornerClick,
    getRowInsertionIndex,
    getColumnInsertionIndex,
    isCellInRange,
    getSelectionEdges,
  };
}
