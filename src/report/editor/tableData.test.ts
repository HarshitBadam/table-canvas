import { describe, it, expect } from 'vitest';
import {
  selectRows,
  resolveDisplayColumns,
  toggleColumnSelection,
  DEFAULT_ROW_LIMIT,
  aggregateReportChartRows,
  formatReportCell,
} from './tableData';
import type { ColumnSchema } from '@/types';

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
    { id: 'a', name: 'A', type: 'string', nullable: true },
    { id: 'b', name: 'B', type: 'number', nullable: true },
    { id: 'c', name: 'C', type: 'string', nullable: true },
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

describe('formatReportCell', () => {
  it('formats finite numbers while preserving numeric identifiers', () => {
    const numberColumn: ColumnSchema = {
      id: 'amount',
      name: 'Amount',
      type: 'number',
      nullable: false,
    };
    expect(formatReportCell(12345.5, numberColumn)).toContain('12');
    expect(formatReportCell(12345, {
      ...numberColumn,
      semanticHints: ['id'],
    })).toBe('12345');
  });

  it('renders nulls and booleans consistently', () => {
    const booleanColumn: ColumnSchema = {
      id: 'active',
      name: 'Active',
      type: 'boolean',
      nullable: true,
    };
    expect(formatReportCell(null, booleanColumn)).toBe('');
    expect(formatReportCell(false, booleanColumn)).toBe('False');
  });
});

describe('aggregateReportChartRows', () => {
  const rows = [
    { __rowId: '1', region: 'North', amount: 10 },
    { __rowId: '2', region: 'North', amount: 20 },
    { __rowId: '3', region: 'South', amount: 5 },
    { __rowId: '4', region: 'South', amount: null },
  ];

  it('groups and sums repeated X values', () => {
    expect(aggregateReportChartRows(rows, 'region', 'amount', 'sum')).toEqual([
      { __rowId: 'report_group_0', region: 'North', amount: 30 },
      { __rowId: 'report_group_1', region: 'South', amount: 5 },
    ]);
  });

  it('counts rows without treating missing numeric values as zero-value rows', () => {
    expect(aggregateReportChartRows(rows, 'region', 'amount', 'count')).toEqual([
      { __rowId: 'report_group_0', region: 'North', amount: 2 },
      { __rowId: 'report_group_1', region: 'South', amount: 2 },
    ]);
  });
});
