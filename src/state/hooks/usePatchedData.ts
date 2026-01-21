/**
 * usePatchedData Hook
 * 
 * Get table data merged with patches for display.
 */

import { useMemo, useCallback } from 'react'
import { useProjectStore } from '../projectStore'
import { useDataStore } from '../dataStore'
import type { CellValue, ColumnSchema } from '@/types'
import type { Patches } from '@/types'

interface PatchedRow {
  __rowId: string
  [columnId: string]: CellValue
}

/**
 * Get patches for a table
 */
export function usePatches(tableId: string): Patches | undefined {
  return useProjectStore((state) => state.patches[tableId])
}

/**
 * Get a specific version key for patches (for dependency tracking)
 */
export function usePatchVersion(tableId: string): string {
  return useProjectStore((state) => {
    const p = state.patches[tableId]
    if (!p) return '0-0-0-0'
    // Count total cell patches across all columns
    const cellPatchCount = Object.values(p.cellPatches || {}).reduce(
      (sum, colPatches) => sum + Object.keys(colPatches).length,
      0
    )
    const highlightCount = p.highlightedCells?.size || 0
    return `${p.insertedRows?.length || 0}-${cellPatchCount}-${p.deletedRows?.size || 0}-${highlightCount}`
  })
}

/**
 * Get highlighted cells for a table
 */
export function useHighlightedCells(tableId: string): Set<string> | undefined {
  return useProjectStore((state) => state.patches[tableId]?.highlightedCells)
}

/**
 * Check if a specific cell is highlighted
 */
export function useIsCellHighlighted(tableId: string, rowId: string, columnId: string): boolean {
  return useProjectStore((state) => {
    const patches = state.patches[tableId]
    if (!patches?.highlightedCells) return false
    return patches.highlightedCells.has(`${rowId}:${columnId}`)
  })
}

/**
 * Get patched row data for a table
 * Merges base data with patches (cell edits, inserted rows, excludes deleted rows)
 */
export function usePatchedRows(tableId: string, columns: ColumnSchema[]): PatchedRow[] {
  const tableData = useDataStore((state) => state.tableData[tableId])
  const patches = useProjectStore((state) => state.patches[tableId])
  const patchVersion = usePatchVersion(tableId)

  return useMemo(() => {
    let baseRows: PatchedRow[] = []
    if (tableData?.rows) {
      baseRows = tableData.rows as PatchedRow[]
    }

    const insertedRows = patches?.insertedRows ?? []

    if (insertedRows.length > 0) {
      const newRows: PatchedRow[] = insertedRows.map((inserted) => {
        const row: PatchedRow = { __rowId: inserted.rowId }
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
  }, [tableData, patches, columns, patchVersion])
}

/**
 * Create a display value getter that includes patches
 */
export function useDisplayValueGetter(tableId: string, columns: ColumnSchema[]) {
  const patches = useProjectStore((state) => state.patches[tableId])

  return useCallback((rowId: string, columnId: string, baseValue: CellValue): CellValue => {
    // Check for patches first
    if (patches?.cellPatches?.[columnId]?.[rowId] !== undefined) {
      return patches.cellPatches[columnId][rowId]
    }
    return baseValue
  }, [patches, columns])
}

/**
 * Check if a row is deleted
 */
export function useIsRowDeleted(tableId: string, rowId: string): boolean {
  return useProjectStore((state) => {
    const patches = state.patches[tableId]
    return patches?.deletedRows?.has(rowId) ?? false
  })
}
