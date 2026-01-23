/**
 * BlankTableBlock Component
 * 
 * Editable blank table - Excel-like styling.
 */

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useReportStore } from '../../reportStore';
import type { BlankTableBlock as BlankTableBlockType } from '../../types';

interface BlankTableBlockProps {
  block: BlankTableBlockType;
  reportId: string;
  isSelected: boolean;
}

export const BlankTableBlock = memo(function BlankTableBlock({ block, reportId, isSelected }: BlankTableBlockProps) {
  const updateBlock = useReportStore((state) => state.updateBlock);
  
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleHeaderChange = useCallback((colIndex: number, value: string) => {
    const newHeaders = [...block.data.headers];
    newHeaders[colIndex] = value;
    updateBlock(reportId, block.id, {
      data: { ...block.data, headers: newHeaders },
    });
  }, [block.data, block.id, reportId, updateBlock]);

  const handleCellChange = useCallback((rowIndex: number, colIndex: number, value: string) => {
    const newRows = block.data.rows.map((row, rIdx) => 
      rIdx === rowIndex 
        ? row.map((cell, cIdx) => cIdx === colIndex ? value : cell)
        : row
    );
    updateBlock(reportId, block.id, {
      data: { ...block.data, rows: newRows },
    });
  }, [block.data, block.id, reportId, updateBlock]);

  const startEditing = useCallback((row: number, col: number) => {
    const value = row === -1 
      ? block.data.headers[col] 
      : block.data.rows[row]?.[col] ?? '';
    setEditingCell({ row, col });
    setEditValue(String(value));
  }, [block.data]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    if (editingCell.row === -1) {
      handleHeaderChange(editingCell.col, editValue);
    } else {
      handleCellChange(editingCell.row, editingCell.col, editValue);
    }
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, handleHeaderChange, handleCellChange]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      if (editingCell) {
        const { row, col } = editingCell;
        const nextCol = col + 1;
        if (nextCol < block.columnCount) {
          startEditing(row, nextCol);
        } else if (row + 1 < block.rowCount) {
          startEditing(row + 1, 0);
        }
      }
    }
  }, [commitEdit, cancelEdit, editingCell, block.columnCount, block.rowCount, startEditing]);

  const handleAddRow = useCallback(() => {
    const newRow = Array(block.columnCount).fill('');
    updateBlock(reportId, block.id, {
      rowCount: block.rowCount + 1,
      data: { ...block.data, rows: [...block.data.rows, newRow] },
    });
  }, [block, reportId, updateBlock]);

  const handleAddColumn = useCallback(() => {
    const newHeaders = [...block.data.headers, `Col ${block.columnCount + 1}`];
    const newRows = block.data.rows.map(row => [...row, '']);
    updateBlock(reportId, block.id, {
      columnCount: block.columnCount + 1,
      data: { headers: newHeaders, rows: newRows },
    });
  }, [block, reportId, updateBlock]);

  return (
    <div className="my-2">
      {block.caption && (
        <div className="mb-1 text-sm text-gray-600 dark:text-gray-400">
          {block.caption}
        </div>
      )}

      <table className="w-full border-collapse text-sm" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            {block.data.headers.map((header, colIndex) => (
              <th 
                key={colIndex}
                className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-left font-medium text-gray-900 dark:text-gray-100 cursor-text"
                onClick={() => startEditing(-1, colIndex)}
              >
                {editingCell?.row === -1 && editingCell?.col === colIndex ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-white dark:bg-gray-700 px-1 -mx-1 border-2 border-accent-green outline-none"
                  />
                ) : (
                  header || <span className="text-gray-400">Column {colIndex + 1}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.data.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, colIndex) => (
                <td 
                  key={colIndex}
                  className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-900 dark:text-gray-100 cursor-text"
                  onClick={() => startEditing(rowIndex, colIndex)}
                >
                  {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={handleKeyDown}
                      className="w-full bg-white dark:bg-gray-700 px-1 -mx-1 border-2 border-accent-green outline-none"
                    />
                  ) : (
                    cell || <span className="text-gray-300">&nbsp;</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
        <span>{block.rowCount} × {block.columnCount}</span>
        {isSelected && (
          <>
            <button onClick={handleAddRow} className="hover:text-accent-green">+ Row</button>
            <button onClick={handleAddColumn} className="hover:text-accent-green">+ Column</button>
          </>
        )}
      </div>
    </div>
  );
});

export default BlankTableBlock;
