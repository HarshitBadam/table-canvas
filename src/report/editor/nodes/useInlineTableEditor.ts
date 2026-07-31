import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { MouseEvent } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import type { ContextMenuState } from './TableContextMenu';
import { useReportTableCells, type TableCellValue } from './useReportTableCells';

interface InlineTableNodeAttrs {
  headers: string[];
  rows: TableCellValue[][];
  caption?: string;
  sourceInfo?: {
    tableId: string;
    tableName: string;
  };
}

export function useInlineTableEditor(
  node: NodeViewProps['node'],
  updateAttributes: NodeViewProps['updateAttributes'],
  grip: { onEnterGrid?: () => void; onLeaveGrid?: () => void } = {},
) {
  const attrs = node.attrs as InlineTableNodeAttrs;
  const headers = useMemo(() => attrs.headers ?? [], [attrs.headers]);
  const rows = useMemo(() => attrs.rows ?? [], [attrs.rows]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const cells = useReportTableCells({
    headers,
    rows,
    updateAttributes,
    onEnterGrid: grip.onEnterGrid,
    onLeaveGrid: grip.onLeaveGrid,
  });

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
    cells,
    contextMenu,
    contextMenuRef,
    handleContextMenu,
    addRow,
    addColumn,
    deleteRow,
    deleteColumn,
  };
}
