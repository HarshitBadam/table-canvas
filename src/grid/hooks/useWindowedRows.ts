import { useCallback, useEffect, useRef, useState } from 'react'
import { getEngine } from '@/engine/EngineAdapter'
import { ensureTableMaterialized } from '@/engine/materializationService'
import type { ColumnSchema, ViewFilterConfig } from '@/types'
import type { FilterConditionDef, SortDef, TableSlice } from '@/engine/types'
import type { GridRow } from '../types'

const WINDOW_SIZE = 100
const PREFETCH_THRESHOLD = 20

export interface WindowedRowsState {
  totalRows: number
  getRowAtIndex: (index: number) => GridRow | null
  getLoadedRows: () => Map<number, GridRow>
  ensureRange: (startIndex: number, endIndex: number) => void
  version: number
  isLoading: boolean
  error: string | null
  invalidate: () => void
}

interface WindowState {
  start: number
  end: number
  rows: Map<number, GridRow>
}

export function useWindowedRows(
  tableId: string,
  columns: ColumnSchema[],
  filters: ViewFilterConfig | null,
  sorts: SortDef[] | undefined,
  search: string | undefined,
): WindowedRowsState {
  const [totalRows, setTotalRows] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const windowRef = useRef<WindowState>({ start: 0, end: 0, rows: new Map() })
  const generationRef = useRef(0)
  const fetchInFlightRef = useRef(false)
  const pendingFetchRef = useRef<{ offset: number; limit: number } | null>(null)
  const [version, setVersion] = useState(0)

  const fingerprintRef = useRef('')

  const getFingerprint = useCallback(() => {
    const filterStr = filters ? JSON.stringify(filters.conditions) + filters.logic : ''
    const sortStr = sorts ? JSON.stringify(sorts) : ''
    return `${tableId}|${filterStr}|${sortStr}|${search || ''}`
  }, [tableId, filters, sorts, search])

  const buildFilterDefs = useCallback((): FilterConditionDef[] | undefined => {
    if (!filters || filters.conditions.length === 0) return undefined
    const colMap = new Map<string, ColumnSchema>()
    columns.forEach(c => colMap.set(c.id, c))

    return filters.conditions.map(cond => {
      const col = colMap.get(cond.columnId)
      return {
        column: col?.name || cond.columnId,
        operator: cond.operator,
        value: cond.value,
        value2: cond.value2,
        columnType: col?.type,
      }
    })
  }, [filters, columns])

  const fetchWindow = useCallback(async (offset: number, limit: number) => {
    if (fetchInFlightRef.current) {
      pendingFetchRef.current = { offset, limit }
      return
    }
    fetchInFlightRef.current = true
    setIsLoading(true)

    const gen = generationRef.current

    try {
      const materialization = await ensureTableMaterialized(tableId)
      if (materialization.status === 'error') {
        throw new Error(materialization.error || 'Failed to materialize table')
      }
      if (materialization.status === 'loading') {
        throw new Error('Table data changed while loading. Please try again.')
      }
      const engine = getEngine()

      const filterDefs = buildFilterDefs()
      let slice: TableSlice

      if (filterDefs || sorts?.length || search) {
        slice = await engine.getFilteredSlice({
          tableId,
          filters: filterDefs,
          sorts,
          search,
          offset,
          limit,
          columns,
        })
      } else {
        slice = await engine.getSlice(tableId, offset, limit, columns)
      }

      if (gen !== generationRef.current) return

      const newRows = new Map<number, GridRow>()
      slice.rows.forEach((row, idx) => {
        const gridRow: GridRow = {
          __rowId: (row.__rowId as string) || `row_${offset + idx}`,
          ...row,
        }
        newRows.set(offset + idx, gridRow)
      })

      const previous = windowRef.current
      const nextEnd = offset + slice.rows.length
      const isAdjacent = offset <= previous.end + PREFETCH_THRESHOLD
        && nextEnd >= previous.start - PREFETCH_THRESHOLD
      const mergedRows = isAdjacent ? new Map(previous.rows) : new Map<number, GridRow>()
      newRows.forEach((row, index) => mergedRows.set(index, row))

      const maxCachedRows = WINDOW_SIZE * 3
      if (mergedRows.size > maxCachedRows) {
        const center = offset + Math.floor(slice.rows.length / 2)
        const retained = [...mergedRows.entries()]
          .sort(([left], [right]) => Math.abs(left - center) - Math.abs(right - center))
          .slice(0, maxCachedRows)
        mergedRows.clear()
        retained.forEach(([index, row]) => mergedRows.set(index, row))
      }

      const cachedIndexes = [...mergedRows.keys()]
      windowRef.current = {
        start: cachedIndexes.length > 0 ? Math.min(...cachedIndexes) : offset,
        end: cachedIndexes.length > 0 ? Math.max(...cachedIndexes) + 1 : nextEnd,
        rows: mergedRows,
      }
      setTotalRows(slice.totalRows)
      setError(null)
      setVersion(v => v + 1)
    } catch (e) {
      if (gen !== generationRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      fetchInFlightRef.current = false
      setIsLoading(false)
      const pending = pendingFetchRef.current
      if (pending) {
        pendingFetchRef.current = null
        void fetchWindow(pending.offset, pending.limit)
      }
    }
  }, [tableId, buildFilterDefs, sorts, search, columns])

  useEffect(() => {
    const newFingerprint = getFingerprint()
    if (newFingerprint === fingerprintRef.current) return
    fingerprintRef.current = newFingerprint
    generationRef.current++
    windowRef.current = { start: 0, end: 0, rows: new Map() }
    void fetchWindow(0, WINDOW_SIZE)
  }, [fetchWindow, getFingerprint])

  const getRowAtIndex = useCallback((index: number): GridRow | null => {
    const win = windowRef.current
    const row = win.rows.get(index)
    if (row) return row

    if (index < win.start - PREFETCH_THRESHOLD || index >= win.end + PREFETCH_THRESHOLD) {
      const newStart = Math.max(0, index - Math.floor(WINDOW_SIZE / 4))
      fetchWindow(newStart, WINDOW_SIZE)
    } else if (index >= win.end - PREFETCH_THRESHOLD && index < win.end + WINDOW_SIZE) {
      fetchWindow(win.end, WINDOW_SIZE)
    } else if (index < win.start + PREFETCH_THRESHOLD && win.start > 0) {
      const newStart = Math.max(0, win.start - WINDOW_SIZE)
      fetchWindow(newStart, WINDOW_SIZE)
    }

    return null
  }, [fetchWindow])

  const getLoadedRows = useCallback((): Map<number, GridRow> => {
    const merged = new Map<number, GridRow>()
    windowRef.current.rows.forEach((row, idx) => merged.set(idx, row))
    return merged
  }, [])

  const ensureRange = useCallback((startIndex: number, endIndex: number) => {
    getRowAtIndex(Math.max(0, startIndex))
    getRowAtIndex(Math.max(0, endIndex))
  }, [getRowAtIndex])

  const invalidate = useCallback(() => {
    generationRef.current++
    windowRef.current = { start: 0, end: 0, rows: new Map() }
    pendingFetchRef.current = null
    setTotalRows(0)
    setError(null)
    setVersion(v => v + 1)
    void fetchWindow(0, WINDOW_SIZE)
  }, [fetchWindow])

  return { totalRows, getRowAtIndex, getLoadedRows, ensureRange, version, isLoading, error, invalidate }
}
