import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import type { ContextMenuState } from './TableContextMenu';

interface InlineTableNodeAttrs {
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  caption?: string;
  sourceInfo?: {
    tableId: string;
    tableName: string;
  };
}

export function useInlineTableEditor(
  node: NodeViewProps['node'],
  updateAttributes: NodeViewProps['updateAttributes'],
) {
  const attrs = node.attrs as InlineTableNodeAttrs;
  const headers = useMemo(() => attrs.headers ?? [], [attrs.headers]);
  const rows = useMemo(() => attrs.rows ?? [], [attrs.rows]);

  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as globalThis.Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const handleCellClick = useCallback((rowIndex: number, colIndex: number) => {
    const value = rows[rowIndex]?.[colIndex];
    setEditValue(value !== null && value !== undefined ? String(value) : '');
    setEditingCell({ row: rowIndex, col: colIndex });
  }, [rows]);

  const handleCellBlur = useCallback(() => {
    if (editingCell && editingCell.row >= 0) {
      const newRows = rows.map(r => [...r]);
      newRows[editingCell.row][editingCell.col] = editValue;
      updateAttributes({ rows: newRows });
      setEditingCell(null);
    }
  }, [editingCell, editValue, rows, updateAttributes]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellBlur();
      if (editingCell && editingCell.row >= 0 && editingCell.row < rows.length - 1) {
        const nextValue = rows[editingCell.row + 1]?.[editingCell.col];
        setEditValue(nextValue !== null && nextValue !== undefined ? String(nextValue) : '');
        setEditingCell({ row: editingCell.row + 1, col: editingCell.col });
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (editingCell) {
        if (editingCell.row === -1) {
          const newHeaders = [...headers];
          newHeaders[editingCell.col] = editValue;
          updateAttributes({ headers: newHeaders });
          if (editingCell.col < headers.length - 1) {
            setEditValue(headers[editingCell.col + 1] || '');
            setEditingCell({ row: -1, col: editingCell.col + 1 });
          } else {
            const firstCellValue = rows[0]?.[0];
            setEditValue(firstCellValue !== null && firstCellValue !== undefined ? String(firstCellValue) : '');
            setEditingCell({ row: 0, col: 0 });
          }
        } else {
          handleCellBlur();
          const nextCol = (editingCell.col + 1) % headers.length;
          const nextRow = nextCol === 0 ? editingCell.row + 1 : editingCell.row;
          if (nextRow < rows.length) {
            const nextValue = rows[nextRow]?.[nextCol];
            setEditValue(nextValue !== null && nextValue !== undefined ? String(nextValue) : '');
            setEditingCell({ row: nextRow, col: nextCol });
          } else {
            setEditingCell(null);
          }
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }, [handleCellBlur, editingCell, editValue, rows, headers, updateAttributes]);

  const handleHeaderClick = useCallback((colIndex: number) => {
    setEditValue(headers[colIndex] || '');
    setEditingCell({ row: -1, col: colIndex });
  }, [headers]);

  const handleHeaderBlur = useCallback(() => {
    if (editingCell && editingCell.row === -1) {
      const newHeaders = [...headers];
      newHeaders[editingCell.col] = editValue;
      updateAttributes({ headers: newHeaders });
      setEditingCell(null);
    }
  }, [editingCell, editValue, headers, updateAttributes]);

  const handleContextMenu = useCallback((
    e: MouseEvent,
    type: 'row' | 'column' | 'cell',
    index: number,
    colIndex?: number,
  ) => {
    e.preventDefault();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY, type, index, colIndex });
  }, []);

  const addRow = useCallback((atIndex?: number) => {
    const newRow = headers.map(() => '');
    const idx = atIndex !== undefined ? atIndex : rows.length;
    const newRows = [...rows.slice(0, idx), newRow, ...rows.slice(idx)];
    updateAttributes({ rows: newRows });
    setContextMenu(null);
  }, [headers, rows, updateAttributes]);

  const addColumn = useCallback((atIndex?: number) => {
    const idx = atIndex !== undefined ? atIndex : headers.length;
    const newHeaders = [...headers.slice(0, idx), `Column ${headers.length + 1}`, ...headers.slice(idx)];
    const newRows = rows.map(row => [...row.slice(0, idx), '', ...row.slice(idx)]);
    updateAttributes({ headers: newHeaders, rows: newRows });
    setContextMenu(null);
  }, [headers, rows, updateAttributes]);

  const deleteRow = useCallback((index: number) => {
    if (rows.length > 1) {
      const newRows = rows.filter((_, i) => i !== index);
      updateAttributes({ rows: newRows });
    }
    setContextMenu(null);
  }, [rows, updateAttributes]);

  const deleteColumn = useCallback((index: number) => {
    if (headers.length > 1) {
      const newHeaders = headers.filter((_, i) => i !== index);
      const newRows = rows.map(row => row.filter((_, i) => i !== index));
      updateAttributes({ headers: newHeaders, rows: newRows });
    }
    setContextMenu(null);
  }, [headers, rows, updateAttributes]);

  return {
    headers,
    rows,
    attrs,
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
  };
}
