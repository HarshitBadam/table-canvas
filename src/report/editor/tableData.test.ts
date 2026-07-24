import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const getTableData = vi.hoisted(() => vi.fn());

vi.mock('@/engine/tableDataService', () => ({ getTableData }));

import {
  selectRows,
  resolveDisplayColumns,
  toggleColumnSelection,
  DEFAULT_ROW_LIMIT,
  aggregateReportChartRows,
  formatReportCell,
  useTableSource,
} from './tableData';
import type { ColumnSchema } from '@/types';
import { addSource, resetStore } from '@/engine/integrationTestUtils';

beforeEach(() => {
  resetStore();
  getTableData.mockReset();
});

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

describe('useTableSource', () => {
  it('fetches the final page for last-N mode and reports truncation', async () => {
    const tableId = addSource('Sales');
    const firstPage = [
      { __rowId: '1', col1: 'first' },
      { __rowId: '2', col1: 'second' },
    ];
    const lastPage = [
      { __rowId: '4', col1: 'fourth' },
      { __rowId: '5', col1: 'fifth' },
    ];
    getTableData
      .mockResolvedValueOnce({ rows: firstPage, totalRows: 5 })
      .mockResolvedValueOnce({ rows: lastPage, totalRows: 5 });

    const { result } = renderHook(() => useTableSource(tableId, {
      rowSelectionMode: 'last_n',
      rowLimit: 2,
    }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getTableData).toHaveBeenNthCalledWith(1, tableId, 0, 2);
    expect(getTableData).toHaveBeenNthCalledWith(2, tableId, 3, 2);
    expect(result.current.rows).toEqual(lastPage);
    expect(result.current.isTruncated).toBe(true);
  });

  it('surfaces query errors and retries on demand', async () => {
    const tableId = addSource('Sales');
    getTableData
      .mockRejectedValueOnce(new Error('DuckDB worker stopped'))
      .mockResolvedValueOnce({
        rows: [{ __rowId: '1', col1: 'recovered' }],
        totalRows: 1,
      });

    const { result } = renderHook(() => useTableSource(tableId));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('DuckDB worker stopped');

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.rows[0].col1).toBe('recovered');
    expect(getTableData).toHaveBeenCalledTimes(2);
  });

  it('does not present missing persisted rows as an empty table', async () => {
    const tableId = addSource('Sales');
    getTableData.mockResolvedValue({ rows: [], totalRows: 0 });

    const { result } = renderHook(() => useTableSource(tableId));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toContain('expects 100 rows');
  });
});
