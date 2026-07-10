/**
 * Shared table-source utilities for report editor nodes.
 *
 * Both the embedded-table and chart nodes need to:
 *   1. list the tables a user can reference,
 *   2. read a source table's schema + rows from the data store, and
 *   3. make sure that source table is actually materialized (the data store
 *      is an in-memory cache that starts empty and is filled on demand).
 *
 * Centralizing this here keeps those features consistent and well-defined,
 * and keeps the pure selection helpers unit-testable in isolation.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore, type TableRow } from '@/state/dataStore';
import { useProjectStore } from '@/state/projectStore';
import { ensureTableMaterialized } from '@/engine/materializationService';
import type { TableNode as TableNodeType, ColumnSchema } from '@/types';

// ============================================================================
// Row selection (pure)
// ============================================================================

export type RowSelectionMode = 'all' | 'first_n' | 'last_n';

/** Number of rows used when a limit is required but none is configured. */
export const DEFAULT_ROW_LIMIT = 10;

/**
 * Select a subset of rows according to the configured mode.
 * Pure and side-effect free so it can be unit tested directly.
 */
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

// ============================================================================
// Column selection (pure)
// ============================================================================

/**
 * Resolve which columns to display.
 *
 * An empty selection means "all columns". Any selected column ids that no
 * longer exist in the schema are ignored (schemas can change underneath a
 * report). Results always follow the schema's column order for stability.
 */
export function resolveDisplayColumns(
  selectedColumnIds: readonly string[] | undefined,
  allColumns: readonly ColumnSchema[]
): ColumnSchema[] {
  if (!selectedColumnIds || selectedColumnIds.length === 0) {
    return allColumns.slice();
  }
  const selected = new Set(selectedColumnIds);
  const filtered = allColumns.filter((c) => selected.has(c.id));
  // If the selection references only stale columns, fall back to all columns
  // rather than rendering an empty table.
  return filtered.length > 0 ? filtered : allColumns.slice();
}

/**
 * Toggle a single column in a selection, using an empty array to mean
 * "all columns".
 *
 * Rules:
 *   - Starts from the effective selection (empty selection expands to "all").
 *   - Toggling a column adds/removes it.
 *   - The result is normalized to schema order, and collapses back to `[]`
 *     (meaning "all") when every column ends up selected.
 */
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

  // Empty means "all", so collapse a full selection back to [].
  return ordered.length === allColumnIds.length ? [] : ordered;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * List of tables that can be referenced from a report (source + derived).
 * Insertion order is preserved to match the canvas.
 */
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
}

/**
 * Read a source table's schema and rows, ensuring the table is materialized.
 *
 * The data store is a transient cache: after a reload (or before a table has
 * ever been opened) it can be empty even though the table definition exists.
 * This hook triggers materialization on demand so embedded tables and charts
 * render reliably wherever they appear.
 */
export function useTableSource(sourceTableId: string | undefined): TableSourceResult {
  const tableNode = useProjectStore((state) =>
    sourceTableId ? (state.nodes[sourceTableId] as TableNodeType | undefined) : undefined
  );
  const dataEntry = useDataStore((state) =>
    sourceTableId ? state.tableData[sourceTableId] : undefined
  );

  const rows = dataEntry?.rows ?? [];
  const columns = tableNode?.schema?.columns ?? [];
  const cacheError = tableNode?.cacheInfo?.error;
  const isComputing = tableNode?.cacheInfo?.isComputing ?? false;
  const hasRows = rows.length > 0;

  const [materializing, setMaterializing] = useState(false);
  // Guard against re-triggering materialization for the same table repeatedly.
  const attemptedRef = useRef<string | null>(null);

  const isTable = tableNode?.kind === 'source_table' || tableNode?.kind === 'derived_table';

  useEffect(() => {
    if (!sourceTableId || !isTable) return;
    // Nothing to do if we already have data or a materialization already failed.
    if (hasRows || cacheError) return;
    if (attemptedRef.current === sourceTableId) return;

    attemptedRef.current = sourceTableId;
    let cancelled = false;
    setMaterializing(true);
    ensureTableMaterialized(sourceTableId)
      .catch(() => {
        /* error surfaces via cacheInfo.error */
      })
      .finally(() => {
        if (!cancelled) setMaterializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceTableId, isTable, hasRows, cacheError]);

  // Reset the attempt guard when the source changes so a new table re-triggers.
  useEffect(() => {
    if (attemptedRef.current && attemptedRef.current !== sourceTableId) {
      attemptedRef.current = null;
    }
  }, [sourceTableId]);

  let status: TableSourceStatus;
  if (!sourceTableId) status = 'no-source';
  else if (!isTable) status = 'missing-table';
  else if (hasRows) status = 'ready';
  else if (cacheError) status = 'error';
  else if (materializing || isComputing) status = 'loading';
  else status = 'empty';

  return {
    tableNode: isTable ? tableNode : undefined,
    columns,
    rows,
    rowCount: rows.length,
    status,
    error: cacheError,
  };
}
