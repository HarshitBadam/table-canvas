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

  const isRowDeleted = useCallback((rowId: string): boolean => {
    return patches?.deletedRows?.has(rowId) ?? false
  }, [patches])

  // Build rows/filteredRows arrays from the windowed state for backward compat
  // These are sparse-backed: for hooks that still use rows[i],
  // we produce a proxy array based on windowed data.
  const rows: GridRow[] = useMemo(() => {
    const baseRows: GridRow[] = []
    const win = windowed
    for (let i = 0; i < win.totalRows; i++) {
      const row = win.getRowAtIndex(i)
      if (row) {
        baseRows.push(row)
      }
    }

    const insertedRows = patches?.insertedRows ?? []
    if (insertedRows.length > 0) {
      const newRows: GridRow[] = insertedRows.map((inserted) => {
        const row: GridRow = { __rowId: inserted.rowId }
        Object.entries(inserted.values).forEach(([colId, value]) => {
          row[colId] = value
        })
        columns.forEach((col) => {
          if (row[col.id] === undefined) {
            row[col.id] = ''
          }
        })
        return row
      })
      return [...baseRows, ...newRows]
    }

    return baseRows
  }, [windowed.totalRows, windowed.getRowAtIndex, patches, columns, patchVersion])

  const filteredRows = useMemo(() => {
    return rows.filter(row => !isRowDeleted(row.__rowId))
  }, [rows, isRowDeleted])

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
