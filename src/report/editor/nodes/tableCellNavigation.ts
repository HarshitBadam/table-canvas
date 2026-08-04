/** Header cells share the body editing model and are addressed as row -1. */
export const HEADER_ROW = -1;

export interface CellPosition {
  row: number;
  col: number;
}

interface GridBounds {
  rowCount: number;
  columnCount: number;
}

const NAVIGATION_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'] as const;

type NavigationKey = (typeof NAVIGATION_KEYS)[number];

export function isNavigationKey(key: string): key is NavigationKey {
  return (NAVIGATION_KEYS as readonly string[]).includes(key);
}

/**
 * Next cell for a navigation key, clamped to the grid so edge keys hold
 * position instead of letting the browser scroll. Tab wraps along the row then
 * to the next; the header row is included so ArrowUp from the first body row
 * reaches column names.
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
