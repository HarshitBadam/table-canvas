/**
 * useVirtualScroll Hook
 * 
 * Handles virtual scrolling calculations for large datasets.
 */

import { useState, useCallback, useEffect, useRef, RefObject } from 'react';
import { GRID } from '@/design/tokens';

export interface VirtualScrollConfig {
  totalRows: number;
  rowHeight?: number;
  headerHeight?: number;
  bufferRows?: number;
}

export interface VirtualScrollState {
  containerRef: RefObject<HTMLDivElement>;
  scrollTop: number;
  containerHeight: number;
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetTop: number;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function useVirtualScroll({
  totalRows,
  rowHeight = GRID.rowHeight,
  headerHeight = GRID.headerHeight,
  bufferRows = GRID.bufferRows,
}: VirtualScrollConfig): VirtualScrollState {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferRows);
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + bufferRows
  );

  // Total scrollable height
  const totalHeight = totalRows * rowHeight + headerHeight;

  // Offset for positioned rows
  const offsetTop = startIndex * rowHeight;

  // Handle scroll events
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Measure container on mount and resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });

    observer.observe(container);
    setContainerHeight(container.clientHeight);

    return () => observer.disconnect();
  }, []);

  return {
    containerRef,
    scrollTop,
    containerHeight,
    startIndex,
    endIndex,
    totalHeight,
    offsetTop,
    handleScroll,
  };
}
