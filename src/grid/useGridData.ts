import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import type { CellValue, ColumnSchema, ViewFilterConfig } from '@/types'
import { hasActiveFilters, createEmptyFilterConfig } from './filterUtils'
import { computeDisplayValue } from './displayUtils'
import { useWindowedRows } from './hooks/useWindowedRows'
import type { GridRow } from './types'

export function useGridData(tableId: string) {
  const node = useProjectStore((state) => state.getTableNode(tableId))
  const patches = useProjectStore((state) => state.patches[tableId])
  const dataRevision = useProjectStore(
    (state) => state.getTableNode(tableId)?.cacheInfo?.dataRevision ?? 0
  )
  const setTableFilters = useProjectStore((state) => state.setTableFilters)

  const highlightedCells = patches?.highlightedCells
  const persistedFilters = node?.viewFilters

  const tableData = useDataStore((state) => state.tableData[tableId])

  const [localMaterializationError, setMaterializationError] = useState<string | null>(null)

  const cacheInfo = node && (node.kind === 'source_table' || node.kind === 'derived_table')
    ? node.cacheInfo
    : undefined
  const isDirty = cacheInfo?.isDirty ?? false
  const isComputing = cacheInfo?.isComputing ?? false
  const computationError = cacheInfo?.error

  const schema = node?.schema
  const columns: ColumnSchema[] = useMemo(() => schema?.columns ?? [], [schema])
  const isEditable = node?.kind === 'source_table'

  const filters: ViewFilterConfig = useMemo(() => {
    return persistedFilters ?? createEmptyFilterConfig()
  }, [persistedFilters])

  const handleFiltersChange = useCallback((newFilters: ViewFilterConfig) => {
    setTableFilters(tableId, newFilters.conditions.length > 0 ? newFilters : null)
  }, [tableId, setTableFilters])

  const windowed = useWindowedRows(
    tableId,
    columns,
    hasActiveFilters(filters) ? filters : null,
    undefined,
    undefined,
  )
  const { getLoadedRows, invalidate, totalRows: windowedTotalRows, version: windowedVersion } = windowed
  const isMaterializing = windowed.isLoading
  const materializationError = localMaterializationError ?? windowed.error

  const prevDataRevision = useRef(dataRevision)
  useEffect(() => {
    if (prevDataRevision.current !== dataRevision) {
      invalidate()
    }
    prevDataRevision.current = dataRevision
  }, [dataRevision, invalidate])

  const getDisplayValue = useCallback((rowId: string, columnId: string, baseValue: CellValue, row?: GridRow): CellValue => {
    return computeDisplayValue(rowId, columnId, baseValue, row, columns, patches?.cellPatches)
  }, [patches, columns])

  const rows: GridRow[] = useMemo(() => {
    void windowedVersion
    const total = windowedTotalRows
    const baseRows: GridRow[] = []
    baseRows.length = total

    const loaded = getLoadedRows()
    loaded.forEach((row, idx) => {
      if (idx >= 0 && idx < total) baseRows[idx] = row
    })

    return baseRows
  }, [getLoadedRows, windowedTotalRows, windowedVersion])

  const filteredRows = rows

  const unfilteredTotalRows = windowedTotalRows

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
    windowed,
  }
}
