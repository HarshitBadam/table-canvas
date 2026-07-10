import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import type { CellValue, ColumnSchema, ViewFilterConfig } from '@/types'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { hasActiveFilters, createEmptyFilterConfig } from './filterUtils'
import { computeDisplayValue } from './displayUtils'
import { useWindowedRows } from './hooks/useWindowedRows'
import type { GridRow } from './types'
import type { SortDef } from '@/engine/types'

export function useGridData(tableId: string) {
  const node = useProjectStore((state) => state.getTableNode(tableId))
  const patches = useProjectStore((state) => state.patches[tableId])
  const patchVersion = useProjectStore((state) => {
    const p = state.patches[tableId]
    if (!p) return '0-0-0-0'
    const cellPatchCount = Object.values(p.cellPatches || {}).reduce(
      (sum, colPatches) => sum + Object.keys(colPatches).length,
      0
    )
    const highlightCount = p.highlightedCells?.size || 0
    return `${p.insertedRows?.length || 0}-${cellPatchCount}-${p.deletedRows?.size || 0}-${highlightCount}`
  })
  const setTableFilters = useProjectStore((state) => state.setTableFilters)

  const highlightedCells = patches?.highlightedCells
  const persistedFilters = node?.viewFilters

  const tableData = useDataStore((state) => state.tableData[tableId])

  const [isMaterializing, setIsMaterializing] = useState(false)
  const [materializationError, setMaterializationError] = useState<string | null>(null)

  const cacheInfo = node && (node.kind === 'source_table' || node.kind === 'derived_table')
    ? node.cacheInfo
    : undefined
  const isDirty = cacheInfo?.isDirty ?? false
  const isComputing = cacheInfo?.isComputing ?? false
  const computationError = cacheInfo?.error

  const schema = node?.schema
  const columns: ColumnSchema[] = schema?.columns ?? []
  const isEditable = node?.kind === 'source_table'

  const filters: ViewFilterConfig = useMemo(() => {
    return persistedFilters ?? createEmptyFilterConfig()
  }, [persistedFilters])

  const handleFiltersChange = useCallback((newFilters: ViewFilterConfig) => {
    setTableFilters(tableId, newFilters.conditions.length > 0 ? newFilters : null)
  }, [tableId, setTableFilters])

  // Windowed rows from DuckDB
  const windowed = useWindowedRows(
    tableId,
    columns,
    hasActiveFilters(filters) ? filters : null,
    undefined as SortDef[] | undefined,
    undefined,
  )

  // Invalidate window when patches change (e.g., after incremental edit)
  const prevPatchVersion = useRef(patchVersion)
  useEffect(() => {
    if (prevPatchVersion.current !== patchVersion && prevPatchVersion.current !== '0-0-0-0') {
      windowed.invalidate()
    }
    prevPatchVersion.current = patchVersion
  }, [patchVersion, windowed.invalidate])

  const getDisplayValue = useCallback((rowId: string, columnId: string, baseValue: CellValue, row?: GridRow): CellValue => {
    return computeDisplayValue(rowId, columnId, baseValue, row, columns, patches?.cellPatches)
  }, [patches, columns])

  // Build an index-aligned bridge array from the windowed state. Many grid hooks and
  // components address rows by absolute index (rows[i], filteredRows[i]) and use
  // rows.length as the row count, so this MUST be index-aligned, not compacted.
  //
  // The array is sparse: loaded indices hold real rows; not-yet-fetched indices are
  // holes that render as skeletons. `windowed.version` forces a rebuild as the window
  // scrolls so freshly fetched rows appear. Inserted rows (patches) are appended after
  // the engine-backed rows.
  const rows: GridRow[] = useMemo(() => {
    const total = windowed.totalRows
    const baseRows: GridRow[] = []
    baseRows.length = total // sparse: correct length without allocating every element

    const loaded = windowed.getLoadedRows()
    loaded.forEach((row, idx) => {
      if (idx >= 0 && idx < total) baseRows[idx] = row
    })

    const insertedRows = patches?.insertedRows ?? []
    insertedRows.forEach((inserted, i) => {
      const row: GridRow = { __rowId: inserted.rowId }
      Object.entries(inserted.values).forEach(([colId, value]) => {
        row[colId] = value
      })
      columns.forEach((col) => {
        if (row[col.id] === undefined) {
          row[col.id] = ''
        }
      })
      baseRows[total + i] = row
    })

    return baseRows
    // windowed.version bumps whenever loaded data changes; patchVersion captures patch edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowed.totalRows, windowed.version, windowed.getLoadedRows, patches, columns, patchVersion])

  // Deleted rows are removed by the engine on re-materialization, so the bridge is
  // already index-aligned and filtered === full. Compacting here would break both
  // index alignment and the virtualizer's row count.
  const filteredRows = rows

  const totalRowCount = windowed.totalRows + (patches?.insertedRows?.length ?? 0)
  const deletedCount = patches?.deletedRows?.size ?? 0
  const unfilteredTotalRows = totalRowCount - deletedCount

  // Materialization trigger (same as before, for initial load)
  useEffect(() => {
    if (!node) return
    if (isComputing || isMaterializing) return

    const hasBeenComputed = cacheInfo?.lastComputedAt && !cacheInfo?.error
    const needsMat = isDirty || (!tableData && !windowed.totalRows) ||
      (windowed.totalRows === 0 && !hasBeenComputed && !tableData?.rows?.length)

    if (needsMat && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      setIsMaterializing(true)
      setMaterializationError(null)

      ensureTableMaterialized(tableId)
        .then((result) => {
          if (result.status === 'error') {
            setMaterializationError(result.error || 'Unknown error')
          } else {
            setMaterializationError(null)
            windowed.invalidate()
          }
        })
        .catch((error) => {
          setMaterializationError(error instanceof Error ? error.message : String(error))
        })
        .finally(() => {
          setIsMaterializing(false)
        })
    }
  }, [tableId, node, isDirty, isComputing, isMaterializing, tableData, cacheInfo])

  return {
    node,
    patches,
    columns,
    rows,
    filteredRows,
    unfilteredTotalRows,
    isEditable,
    isDirty,
    isComputing,
    isMaterializing,
    materializationError,
    setMaterializationError,
    computationError,
    highlightedCells,
    tableData,
    getDisplayValue,
    filters,
    handleFiltersChange,
    // Windowed model (new)
    windowed,
  }
}
