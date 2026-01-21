/**
 * useColumnResize Hook
 * 
 * Handles column resizing functionality for the grid.
 */

import { useState, useCallback, useEffect } from 'react';
import { GRID } from '@/design/tokens';

export interface ColumnResizeConfig {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export interface ColumnResizeState {
  columnWidths: Record<string, number>;
  resizingColumn: string | null;
  getColumnWidth: (columnId: string) => number;
  handleResizeStart: (columnId: string, e: React.MouseEvent) => void;
}

export function useColumnResize({
  defaultWidth = GRID.columnWidth,
  minWidth = GRID.minColumnWidth,
  maxWidth = GRID.maxColumnWidth,
}: ColumnResizeConfig = {}): ColumnResizeState {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Get column width with fallback to default
  const getColumnWidth = useCallback(
    (columnId: string) => {
      return columnWidths[columnId] || defaultWidth;
    },
    [columnWidths, defaultWidth]
  );

  // Start resizing a column
  const handleResizeStart = useCallback(
    (columnId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingColumn(columnId);
      setResizeStartX(e.clientX);
      setResizeStartWidth(columnWidths[columnId] || defaultWidth);
    },
    [columnWidths, defaultWidth]
  );

  // Global mouse move/up for resizing
  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStartWidth + delta));
      setColumnWidths((prev) => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth, minWidth, maxWidth]);

  return {
    columnWidths,
    resizingColumn,
    getColumnWidth,
    handleResizeStart,
  };
}
