import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TableRow } from '@/state/dataStore';
import { useProjectStore } from '@/state/projectStore';
import { getTableData } from '@/engine/materializationService';
import type {
  AggregationType,
  TableNode as TableNodeType,
  ColumnSchema,
} from '@/types';

export type RowSelectionMode = 'all' | 'first_n' | 'last_n';

export const DEFAULT_ROW_LIMIT = 10;
export const MAX_EMBEDDED_TABLE_ROWS = 1_000;
export const MAX_REPORT_CHART_ROWS = 5_000;

export function formatReportCell(
  value: string | number | boolean | null | undefined,
  column: ColumnSchema,
): string {
  if (value === null || value === undefined || value === '') return '';
  if (column.type === 'boolean' || typeof value === 'boolean') {
    if (value === true || value === 'true' || value === 'True') return 'True';
    if (value === false || value === 'false' || value === 'False') return 'False';
  }
  if (column.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    if (column.semanticHints?.includes('id')) return String(value);
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  if ((column.type === 'date' || column.type === 'datetime') && typeof value === 'string') {
    const date = new Date(column.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00Z`
      : value);
    if (!Number.isNaN(date.getTime())) {
      return column.type === 'date'
        ? date.toLocaleDateString(undefined, { timeZone: 'UTC' })
        : date.toLocaleString();
    }
  }
  return String(value);
}

export function aggregateReportChartRows(
  rows: readonly TableRow[],
  xAxis: string,
  yAxis: string,
  aggregation: AggregationType | undefined,
): TableRow[] {
  if (!aggregation) return rows.slice();

  interface Group {
    xValue: TableRow[string];
    values: number[];
    distinctValues: Set<string>;
    rowCount: number;
  }
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const xValue = row[xAxis];
    const key = `${typeof xValue}:${String(xValue)}`;
    const group = groups.get(key) || {
      xValue,
      values: [],
      distinctValues: new Set<string>(),
      rowCount: 0,
    };
    group.rowCount += 1;
    const rawValue = row[yAxis];
    if (rawValue !== null && rawValue !== '' && Number.isFinite(Number(rawValue))) {
      group.values.push(Number(rawValue));
      group.distinctValues.add(`${typeof rawValue}:${String(rawValue)}`);
    }
    groups.set(key, group);
  }

  return [...groups.values()].map((group, index) => {
    let value: number;
    switch (aggregation) {
      case 'count':
        value = group.rowCount;
        break;
      case 'count_distinct':
        value = group.distinctValues.size;
        break;
      case 'avg':
        value = group.values.length > 0
          ? group.values.reduce((sum, item) => sum + item, 0) / group.values.length
          : 0;
        break;
      case 'min':
        value = group.values.length > 0 ? Math.min(...group.values) : 0;
        break;
      case 'max':
        value = group.values.length > 0 ? Math.max(...group.values) : 0;
        break;
      case 'sum':
      default:
        value = group.values.reduce((sum, item) => sum + item, 0);
        break;
    }
    return {
      __rowId: `report_group_${index}`,
      [xAxis]: group.xValue,
      [yAxis]: value,
    };
  });
}

export function selectRows<T>(
  rows: readonly T[],
  mode: RowSelectionMode,
  limit: number = DEFAULT_ROW_LIMIT
): T[] {
  if (mode === 'all') return rows.slice();

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_ROW_LIMIT;

  if (mode === 'first_n') return rows.slice(0, safeLimit);
  if (mode === 'last_n') return safeLimit >= rows.length ? rows.slice() : rows.slice(-safeLimit);

  return rows.slice();
}

export function resolveDisplayColumns(
  selectedColumnIds: readonly string[] | undefined,
  allColumns: readonly ColumnSchema[]
): ColumnSchema[] {
  if (!selectedColumnIds || selectedColumnIds.length === 0) {
    return allColumns.slice();
  }
  const selected = new Set(selectedColumnIds);
  const filtered = allColumns.filter((c) => selected.has(c.id));
  return filtered.length > 0 ? filtered : allColumns.slice();
}

export function toggleColumnSelection(
  selectedColumnIds: readonly string[],
  allColumnIds: readonly string[],
  columnId: string
): string[] {
  const effective =
    selectedColumnIds.length === 0
      ? allColumnIds.slice()
      : allColumnIds.filter((id) => selectedColumnIds.includes(id));

  const next = effective.includes(columnId)
    ? effective.filter((id) => id !== columnId)
    : [...effective, columnId];

  const ordered = allColumnIds.filter((id) => next.includes(id));

  return ordered.length === allColumnIds.length ? [] : ordered;
}

export function useSelectableTables(): TableNodeType[] {
  const nodes = useProjectStore((state) => state.nodes);
  return useMemo(
    () =>
      Object.values(nodes).filter(
        (n): n is TableNodeType => n.kind === 'source_table' || n.kind === 'derived_table'
      ),
    [nodes]
  );
}

type TableSourceStatus =
  | 'no-source'
  | 'missing-table'
  | 'loading'
  | 'error'
  | 'empty'
  | 'ready';

export interface TableSourceResult {
  tableNode: TableNodeType | undefined;
  columns: ColumnSchema[];
  rows: TableRow[];
  rowCount: number;
  status: TableSourceStatus;
  error?: string;
  isTruncated: boolean;
  retry: () => void;
}

interface TableSourceOptions {
  rowSelectionMode?: RowSelectionMode;
  rowLimit?: number;
  maxRows?: number;
}

export function useTableSource(
  sourceTableId: string | undefined,
  options: TableSourceOptions = {},
): TableSourceResult {
  const {
    rowSelectionMode = 'first_n',
    rowLimit = DEFAULT_ROW_LIMIT,
    maxRows = MAX_EMBEDDED_TABLE_ROWS,
  } = options;
  const tableNode = useProjectStore((state) =>
    sourceTableId ? (state.nodes[sourceTableId] as TableNodeType | undefined) : undefined
  );
  const columns = tableNode?.schema?.columns ?? [];
  const expectedRowCount = tableNode?.cacheInfo?.lastRowCount
    ?? tableNode?.schema?.rowCount
    ?? 0;
  const cacheError = tableNode?.cacheInfo?.error;
  const sourceVersionHash = tableNode?.cacheInfo?.currentVersionHash;
  const dataRevision = tableNode?.cacheInfo?.dataRevision ?? 0;
  const isTable = tableNode?.kind === 'source_table' || tableNode?.kind === 'derived_table';
  const safeMaxRows = Math.max(1, Math.min(Math.floor(maxRows) || MAX_EMBEDDED_TABLE_ROWS, MAX_REPORT_CHART_ROWS));
  const safeRowLimit = Math.max(
    1,
    Math.min(Math.floor(rowLimit) || DEFAULT_ROW_LIMIT, safeMaxRows),
  );
  const requestedRows = rowSelectionMode === 'all' ? safeMaxRows : safeRowLimit;

  const [rows, setRows] = useState<TableRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [queryError, setQueryError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setRowCount(0);
    setQueryError(undefined);

    if (!sourceTableId || !isTable) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        let result = await getTableData(sourceTableId, 0, requestedRows);
        if (
          rowSelectionMode === 'last_n'
          && !result.error
          && result.totalRows > requestedRows
        ) {
          result = await getTableData(
            sourceTableId,
            Math.max(0, result.totalRows - requestedRows),
            requestedRows,
          );
        }
        if (cancelled) return;
        setRows(result.rows);
        setRowCount(result.totalRows);
        setQueryError(
          result.error
          || (result.totalRows === 0 && expectedRowCount > 0
            ? `The source expects ${expectedRowCount.toLocaleString()} rows, but its data is unavailable. Open the table to repair or re-import it.`
            : undefined),
        );
      } catch (error) {
        if (!cancelled) {
          setQueryError(error instanceof Error ? error.message : 'Unable to load table data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    sourceTableId,
    isTable,
    requestedRows,
    rowSelectionMode,
    retryCount,
    expectedRowCount,
    sourceVersionHash,
    dataRevision,
  ]);

  let status: TableSourceStatus;
  if (!sourceTableId) status = 'no-source';
  else if (!isTable) status = 'missing-table';
  else if (loading) status = 'loading';
  else if (queryError || cacheError) status = 'error';
  else if (rowCount > 0) status = 'ready';
  else status = 'empty';

  return {
    tableNode: isTable ? tableNode : undefined,
    columns,
    rows,
    rowCount,
    status,
    error: queryError || cacheError,
    isTruncated: rowCount > rows.length,
    retry,
  };
}
