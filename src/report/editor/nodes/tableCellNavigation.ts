/** The header row is edited like any other row, and addressed as row -1. */
export const HEADER_ROW = -1;

export interface CellPosition {
  row: number;
  col: number;
}

export interface GridBounds {
  rowCount: number;
  columnCount: number;
}

const NAVIGATION_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'] as const;

export type NavigationKey = (typeof NAVIGATION_KEYS)[number];

export function isNavigationKey(key: string): key is NavigationKey {
  return (NAVIGATION_KEYS as readonly string[]).includes(key);
}

/**
 * The cell a navigation key moves to, clamped to the grid so a key at the edge
 * holds position instead of doing nothing visible and letting the browser
 * scroll the grid instead. Tab walks the cells as text — along the row, then on
 * to the next one — which is the only move that changes both coordinates.
 *
 * The header row is part of the grid: ArrowUp from the first body row reaches
 * it, so column names are renamed with the same keys as everything else.
 */
export function moveTarget(
  key: NavigationKey,
  reverse: boolean,
  current: CellPosition,
  bounds: GridBounds,
): CellPosition {
  if (bounds.rowCount <= 0 || bounds.columnCount <= 0) return current;

  let { row, col } = current;
  if (key === 'ArrowUp') row -= 1;
  else if (key === 'ArrowDown') row += 1;
  else if (key === 'ArrowLeft') col -= 1;
  else if (key === 'ArrowRight') col += 1;
  else {
    col += reverse ? -1 : 1;
    if (col >= bounds.columnCount) {
      col = 0;
      row += 1;
    } else if (col < 0) {
      col = bounds.columnCount - 1;
      row -= 1;
    }
  }

  return {
    row: Math.max(HEADER_ROW, Math.min(bounds.rowCount - 1, row)),
    col: Math.max(0, Math.min(bounds.columnCount - 1, col)),
  };
}
