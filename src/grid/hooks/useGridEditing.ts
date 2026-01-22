/**
 * useGridEditing Hook
 * 
 * Handles cell editing functionality including validation.
 */

import { useState, useCallback } from 'react';
import { CellValue, ColumnSchema } from '@/lib/types';

export interface EditingCell {
  rowIndex: number;
  columnId: string;
}

export interface ValidationResult {
  valid: boolean;
  error: string | null;
  parsedValue: CellValue;
}

export interface GridEditingConfig {
  columns: ColumnSchema[];
  onCellChange: (rowId: string, columnId: string, value: CellValue) => void;
  onSaveSnapshot: (description: string) => void;
}

export interface GridEditingState {
  editingCell: EditingCell | null;
  editValue: string;
  editError: string | null;
  startEditing: (rowIndex: number, columnId: string, currentValue: CellValue) => void;
  commitEdit: (rowId: string) => void;
  cancelEdit: () => void;
  setEditValue: (value: string) => void;
}

/**
 * Validate a value against a column type
 */
export function validateValue(
  value: string,
  columnType: string
): ValidationResult {
  // Empty values are allowed (nullable)
  if (value === '' || value.trim() === '') {
    return { valid: true, error: null, parsedValue: '' };
  }

  switch (columnType) {
    case 'number': {
      const cleanValue = value.replace(/,/g, '').trim();
      const num = Number(cleanValue);
      if (isNaN(num)) {
        return { valid: false, error: 'Please enter a valid number', parsedValue: value };
      }
      return { valid: true, error: null, parsedValue: num };
    }

    case 'boolean': {
      const lower = value.toLowerCase().trim();
      if (['true', 'false', '1', '0', 'yes', 'no'].includes(lower)) {
        const boolValue = ['true', '1', 'yes'].includes(lower) ? 'True' : 'False';
        return { valid: true, error: null, parsedValue: boolValue };
      }
      return { valid: false, error: 'Please enter true/false, yes/no, or 1/0', parsedValue: value };
    }

    case 'date': {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return {
          valid: false,
          error: 'Please enter a valid date (e.g., 2024-01-15 or Jan 15, 2024)',
          parsedValue: value,
        };
      }
      return { valid: true, error: null, parsedValue: value };
    }

    default:
      return { valid: true, error: null, parsedValue: value };
  }
}

export function useGridEditing({
  columns,
  onCellChange,
  onSaveSnapshot,
}: GridEditingConfig): GridEditingState {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);

  // Start editing a cell
  const startEditing = useCallback(
    (rowIndex: number, columnId: string, currentValue: CellValue) => {
      setEditingCell({ rowIndex, columnId });

      // Format the value for editing
      let editVal = String(currentValue ?? '');
      const column = columns.find((c) => c.id === columnId);

      // Normalize booleans to "True"/"False"
      if (column?.type === 'boolean' || typeof currentValue === 'boolean') {
        if (currentValue === true || currentValue === 'true' || currentValue === 'True') {
          editVal = 'True';
        } else if (currentValue === false || currentValue === 'false' || currentValue === 'False') {
          editVal = 'False';
        }
      }

      setEditValue(editVal);
      setEditError(null);
    },
    [columns]
  );

  // Commit the current edit
  const commitEdit = useCallback(
    (rowId: string) => {
      if (!editingCell) return;

      // Get the column type
      const column = columns.find((c) => c.id === editingCell.columnId);
      const columnType = column?.type || 'string';

      // Validate the value
      const validation = validateValue(editValue, columnType);

      if (!validation.valid) {
        setEditError(validation.error);
        return; // Don't commit, keep editing
      }

      onSaveSnapshot('Edit cell');
      onCellChange(rowId, editingCell.columnId, validation.parsedValue);
      setEditingCell(null);
      setEditValue('');
      setEditError(null);
    },
    [editingCell, editValue, columns, onCellChange, onSaveSnapshot]
  );

  // Cancel the current edit
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
    setEditError(null);
  }, []);

  return {
    editingCell,
    editValue,
    editError,
    startEditing,
    commitEdit,
    cancelEdit,
    setEditValue,
  };
}
