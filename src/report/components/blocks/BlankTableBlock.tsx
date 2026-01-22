/**
 * BlankTableBlock Component
 * 
 * Editable blank table for the report (Apple Pages style).
 * Allows users to define dimensions and edit cells inline.
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
  const [showConfig, setShowConfig] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Update header value
  const handleHeaderChange = useCallback((colIndex: number, value: string) => {
    const newHeaders = [...block.data.headers];
    newHeaders[colIndex] = value;
    updateBlock(reportId, block.id, {
      data: { ...block.data, headers: newHeaders },
    });
  }, [block.data, block.id, reportId, updateBlock]);

  // Update cell value
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

  // Start editing a cell
  const startEditing = useCallback((row: number, col: number) => {
    const value = row === -1 
      ? block.data.headers[col] 
      : block.data.rows[row]?.[col] ?? '';
    setEditingCell({ row, col });
    setEditValue(String(value));
  }, [block.data]);

  // Commit edit
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

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  // Handle key events during editing
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
      // Move to next cell
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

  // Add row
  const handleAddRow = useCallback(() => {
    const newRow = Array(block.columnCount).fill('');
    updateBlock(reportId, block.id, {
      rowCount: block.rowCount + 1,
      data: { ...block.data, rows: [...block.data.rows, newRow] },
    });
  }, [block, reportId, updateBlock]);

  // Add column
  const handleAddColumn = useCallback(() => {
    const newHeaders = [...block.data.headers, `Col ${block.columnCount + 1}`];
    const newRows = block.data.rows.map(row => [...row, '']);
    updateBlock(reportId, block.id, {
      columnCount: block.columnCount + 1,
      data: { headers: newHeaders, rows: newRows },
    });
  }, [block, reportId, updateBlock]);

  // Remove last row
  const handleRemoveRow = useCallback(() => {
    if (block.rowCount <= 1) return;
    updateBlock(reportId, block.id, {
      rowCount: block.rowCount - 1,
      data: { ...block.data, rows: block.data.rows.slice(0, -1) },
    });
  }, [block, reportId, updateBlock]);

  // Remove last column
  const handleRemoveColumn = useCallback(() => {
    if (block.columnCount <= 1) return;
    updateBlock(reportId, block.id, {
      columnCount: block.columnCount - 1,
      data: {
        headers: block.data.headers.slice(0, -1),
        rows: block.data.rows.map(row => row.slice(0, -1)),
      },
    });
  }, [block, reportId, updateBlock]);

  return (
    <div className="relative">
      {/* Caption */}
      {block.caption && (
        <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {block.caption}
        </div>
      )}

      {/* Table */}
      <div className={`overflow-x-auto rounded-lg border ${
        isSelected 
          ? 'border-accent-green shadow-sm' 
          : 'border-gray-200 dark:border-gray-700'
      }`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {block.data.headers.map((header, colIndex) => (
                <th 
                  key={colIndex}
                  className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 cursor-text min-w-[100px]"
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
                      className="w-full bg-white dark:bg-gray-700 px-1 py-0.5 -mx-1 -my-0.5 rounded border border-accent-green outline-none text-gray-900 dark:text-gray-100"
                    />
                  ) : (
                    <span className="hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 -mx-1 -my-0.5 rounded block">
                      {header || <span className="text-gray-400 italic">Header</span>}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.data.rows.map((row, rowIndex) => (
              <tr 
                key={rowIndex}
                className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
              >
                {row.map((cell, colIndex) => (
                  <td 
                    key={colIndex}
                    className="px-3 py-2 text-gray-900 dark:text-gray-100 cursor-text min-w-[100px]"
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
                        className="w-full bg-white dark:bg-gray-700 px-1 py-0.5 -mx-1 -my-0.5 rounded border border-accent-green outline-none text-gray-900 dark:text-gray-100"
                      />
                    ) : (
                      <span className="hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 -mx-1 -my-0.5 rounded block min-h-[1.5em]">
                        {cell || <span className="text-gray-300 dark:text-gray-600">&nbsp;</span>}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer with controls */}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>
          {block.rowCount} row{block.rowCount !== 1 ? 's' : ''} × {block.columnCount} column{block.columnCount !== 1 ? 's' : ''}
        </span>
        
        {isSelected && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddRow}
              className="text-gray-400 hover:text-accent-green flex items-center gap-1 transition-colors"
              title="Add row"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Row
            </button>
            <button
              onClick={handleAddColumn}
              className="text-gray-400 hover:text-accent-green flex items-center gap-1 transition-colors"
              title="Add column"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Column
            </button>
            <div className="w-px h-3 bg-gray-300 dark:bg-gray-600" />
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configure
            </button>
          </div>
        )}
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            Table Settings
          </h4>
          
          {/* Dimensions */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Rows
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRemoveRow}
                  disabled={block.rowCount <= 1}
                  className="p-1.5 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-8 text-center">
                  {block.rowCount}
                </span>
                <button
                  onClick={handleAddRow}
                  className="p-1.5 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Columns
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRemoveColumn}
                  disabled={block.columnCount <= 1}
                  className="p-1.5 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-8 text-center">
                  {block.columnCount}
                </span>
                <button
                  onClick={handleAddColumn}
                  className="p-1.5 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Click any cell to edit. Press Tab to move to the next cell.
          </p>
        </div>
      )}
    </div>
  );
});

export default BlankTableBlock;
