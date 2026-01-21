/**
 * useAutofill Hook
 * 
 * Handles Excel-style autofill functionality for cells.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { CellValue, ColumnSchema } from '@/lib/types';
import { detectPattern, generateNextValues } from '../autofill';
import { CellRangeSelection, SelectionType } from './useGridSelection';

export interface AutofillPreviewItem {
  rowIndex: number;
  value: CellValue;
}

export interface AutofillConfig {
  columns: ColumnSchema[];
  selection: SelectionType;
  cellRangeSelection: CellRangeSelection | null;
  getDisplayValue: (rowId: string, columnId: string, baseValue: CellValue, row?: GridRow) => CellValue;
  onApplyAutofill: (columnId: string, values: { rowId: string; value: CellValue }[]) => void;
  onSaveSnapshot: (description: string) => void;
}

// Simplified row type
interface GridRow {
  __rowId: string;
  [columnId: string]: CellValue;
}

export interface AutofillState {
  autofillDragging: boolean;
  autofillEndRow: number | null;
  autofillPreview: AutofillPreviewItem[];
  autofillColumnId: string | null;
  handleAutofillStart: (rowIndex: number, columnId: string) => void;
  handleAutofillMove: (targetRowIndex: number, rows: GridRow[]) => void;
  handleAutofillEnd: (rows: GridRow[]) => void;
  getAutofillSourceRange: (rowIndex: number, columnId: string) => { startRow: number; endRow: number };
}

export function useAutofill({
  columns,
  selection,
  cellRangeSelection,
  getDisplayValue,
  onApplyAutofill,
  onSaveSnapshot,
}: AutofillConfig): AutofillState {
  const [autofillDragging, setAutofillDragging] = useState(false);
  const [autofillEndRow, setAutofillEndRow] = useState<number | null>(null);
  const [autofillPreview, setAutofillPreview] = useState<AutofillPreviewItem[]>([]);
  const autofillColumnIdRef = useRef<string | null>(null);

  // Get autofill source range
  const getAutofillSourceRange = useCallback(
    (rowIndex: number, columnId: string): { startRow: number; endRow: number } => {
      // If we have a range selection that includes this column, use that
      if (cellRangeSelection) {
        const colIndex = columns.findIndex((c) => c.id === columnId);
        if (
          colIndex >= cellRangeSelection.startColIndex &&
          colIndex <= cellRangeSelection.endColIndex
        ) {
          return {
            startRow: cellRangeSelection.startRow,
            endRow: cellRangeSelection.endRow,
          };
        }
      }
      // Otherwise use single cell
      return { startRow: rowIndex, endRow: rowIndex };
    },
    [cellRangeSelection, columns]
  );

  // Start autofill drag
  const handleAutofillStart = useCallback(
    (rowIndex: number, columnId: string) => {
      const sourceRange = getAutofillSourceRange(rowIndex, columnId);
      setAutofillDragging(true);
      setAutofillEndRow(sourceRange.endRow);
      autofillColumnIdRef.current = columnId;
      setAutofillPreview([]);
    },
    [getAutofillSourceRange]
  );

  // Update autofill while dragging
  const handleAutofillMove = useCallback(
    (targetRowIndex: number, rows: GridRow[]) => {
      if (!autofillDragging || !autofillColumnIdRef.current) return;

      const columnId = autofillColumnIdRef.current;

      // Get source range
      let sourceStartRow: number;
      let sourceEndRow: number;

      const colIndex = columns.findIndex((c) => c.id === columnId);
      if (
        cellRangeSelection &&
        colIndex >= cellRangeSelection.startColIndex &&
        colIndex <= cellRangeSelection.endColIndex
      ) {
        sourceStartRow = cellRangeSelection.startRow;
        sourceEndRow = cellRangeSelection.endRow;
      } else if (selection?.type === 'cell' && selection.columnId === columnId) {
        sourceStartRow = selection.rowIndex;
        sourceEndRow = selection.rowIndex;
      } else {
        return;
      }

      // Only allow dragging downward
      if (targetRowIndex <= sourceEndRow) {
        setAutofillEndRow(sourceEndRow);
        setAutofillPreview([]);
        return;
      }

      setAutofillEndRow(targetRowIndex);

      // Get all source values from the range
      const sourceValues: CellValue[] = [];
      for (let i = sourceStartRow; i <= sourceEndRow; i++) {
        const row = rows[i];
        if (row) {
          const value = getDisplayValue(row.__rowId, columnId, row[columnId], row);
          sourceValues.push(value);
        }
      }

      if (sourceValues.length === 0) return;

      // Detect pattern and generate preview
      const pattern = detectPattern(sourceValues);
      const count = targetRowIndex - sourceEndRow;
      const previewValues = generateNextValues(pattern, count);

      // Create preview entries
      const preview = previewValues.map((value, idx) => ({
        rowIndex: sourceEndRow + idx + 1,
        value,
      }));

      setAutofillPreview(preview);
    },
    [autofillDragging, cellRangeSelection, selection, columns, getDisplayValue]
  );

  // End autofill and apply values
  const handleAutofillEnd = useCallback(
    (rows: GridRow[]) => {
      if (!autofillDragging || autofillEndRow === null || !autofillColumnIdRef.current) {
        setAutofillDragging(false);
        setAutofillPreview([]);
        return;
      }

      const columnId = autofillColumnIdRef.current;

      // Get source range
      let sourceStartRow: number;
      let sourceEndRow: number;

      const colIndex = columns.findIndex((c) => c.id === columnId);
      if (
        cellRangeSelection &&
        colIndex >= cellRangeSelection.startColIndex &&
        colIndex <= cellRangeSelection.endColIndex
      ) {
        sourceStartRow = cellRangeSelection.startRow;
        sourceEndRow = cellRangeSelection.endRow;
      } else if (selection?.type === 'cell' && selection.columnId === columnId) {
        sourceStartRow = selection.rowIndex;
        sourceEndRow = selection.rowIndex;
      } else {
        setAutofillDragging(false);
        setAutofillPreview([]);
        return;
      }

      const count = autofillEndRow - sourceEndRow;

      if (count > 0) {
        // Get all source values from the range
        const sourceValues: CellValue[] = [];
        for (let i = sourceStartRow; i <= sourceEndRow; i++) {
          const row = rows[i];
          if (row) {
            const value = getDisplayValue(row.__rowId, columnId, row[columnId], row);
            sourceValues.push(value);
          }
        }

        if (sourceValues.length > 0) {
          const pattern = detectPattern(sourceValues);
          const newValues = generateNextValues(pattern, count);

          // Apply values
          onSaveSnapshot('Autofill');
          const valuesToApply = newValues
            .map((value, idx) => {
              const targetRow = rows[sourceEndRow + idx + 1];
              return targetRow ? { rowId: targetRow.__rowId, value } : null;
            })
            .filter((v): v is { rowId: string; value: CellValue } => v !== null);

          onApplyAutofill(columnId, valuesToApply);
        }
      }

      // Reset state
      setAutofillDragging(false);
      setAutofillEndRow(null);
      setAutofillPreview([]);
      autofillColumnIdRef.current = null;
    },
    [
      autofillDragging,
      autofillEndRow,
      cellRangeSelection,
      selection,
      columns,
      getDisplayValue,
      onApplyAutofill,
      onSaveSnapshot,
    ]
  );

  // Global mouse up handler
  useEffect(() => {
    if (!autofillDragging) return;

    const handleMouseUp = () => {
      // Note: rows need to be passed from the component
      // This will be handled in the component
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [autofillDragging]);

  return {
    autofillDragging,
    autofillEndRow,
    autofillPreview,
    autofillColumnId: autofillColumnIdRef.current,
    handleAutofillStart,
    handleAutofillMove,
    handleAutofillEnd,
    getAutofillSourceRange,
  };
}
