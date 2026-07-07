import { describe, it, expect } from 'vitest';
import {
  selectRows,
  resolveDisplayColumns,
  toggleColumnSelection,
  DEFAULT_ROW_LIMIT,
} from './tableData';
import type { ColumnSchema } from '@/lib/types';

describe('selectRows', () => {
  const rows = [1, 2, 3, 4, 5];

  it('returns all rows for "all" mode', () => {
    expect(selectRows(rows, 'all')).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns a copy (not the same reference) for "all"', () => {
    const result = selectRows(rows, 'all');
    expect(result).not.toBe(rows);
  });

  it('returns the first N rows for "first_n"', () => {
    expect(selectRows(rows, 'first_n', 2)).toEqual([1, 2]);
  });

  it('returns the last N rows for "last_n"', () => {
    expect(selectRows(rows, 'last_n', 2)).toEqual([4, 5]);
  });

  it('handles limit larger than length for "last_n"', () => {
    expect(selectRows(rows, 'last_n', 99)).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles limit larger than length for "first_n"', () => {
    expect(selectRows(rows, 'first_n', 99)).toEqual([1, 2, 3, 4, 5]);
  });

  it('falls back to the default limit when limit is invalid', () => {
    const many = Array.from({ length: 50 }, (_, i) => i);
    expect(selectRows(many, 'first_n', 0)).toHaveLength(DEFAULT_ROW_LIMIT);
    expect(selectRows(many, 'first_n', -5)).toHaveLength(DEFAULT_ROW_LIMIT);
    expect(selectRows(many, 'first_n', NaN)).toHaveLength(DEFAULT_ROW_LIMIT);
  });

  it('handles empty input', () => {
    expect(selectRows([], 'first_n', 5)).toEqual([]);
    expect(selectRows([], 'last_n', 5)).toEqual([]);
    expect(selectRows([], 'all')).toEqual([]);
  });
});

describe('resolveDisplayColumns', () => {
  const cols: ColumnSchema[] = [
    { id: 'a', name: 'A', type: 'string' },
    { id: 'b', name: 'B', type: 'number' },
    { id: 'c', name: 'C', type: 'string' },
  ];

  it('returns all columns when selection is empty', () => {
    expect(resolveDisplayColumns([], cols).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns all columns when selection is undefined', () => {
    expect(resolveDisplayColumns(undefined, cols).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns only the selected columns', () => {
    expect(resolveDisplayColumns(['a', 'c'], cols).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('always follows schema order, not selection order', () => {
    expect(resolveDisplayColumns(['c', 'a'], cols).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('ignores selected ids that no longer exist', () => {
    expect(resolveDisplayColumns(['a', 'gone'], cols).map((c) => c.id)).toEqual(['a']);
  });

  it('falls back to all columns when every selected id is stale', () => {
    expect(resolveDisplayColumns(['gone', 'missing'], cols).map((c) => c.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('toggleColumnSelection', () => {
  const allIds = ['a', 'b', 'c'];

  it('deselecting from "all" (empty) yields the remaining columns', () => {
    expect(toggleColumnSelection([], allIds, 'b')).toEqual(['a', 'c']);
  });

  it('reselecting the last missing column collapses back to "all" ([])', () => {
    expect(toggleColumnSelection(['a', 'c'], allIds, 'b')).toEqual([]);
  });

  it('removing a column from an explicit selection', () => {
    expect(toggleColumnSelection(['a', 'b'], allIds, 'b')).toEqual(['a']);
  });

  it('adding a column keeps schema order', () => {
    expect(toggleColumnSelection(['c'], allIds, 'a')).toEqual(['a', 'c']);
  });

  it('ignores stale ids in the incoming selection', () => {
    expect(toggleColumnSelection(['a', 'stale'], allIds, 'c')).toEqual(['a', 'c']);
  });
});
