import { useCallback, useEffect, useRef, useState } from 'react'
import { getEngine } from '@/engine/EngineAdapter'
import { ensureTableMaterialized } from '@/engine/materializationService'
import type { ColumnSchema, ViewFilterConfig } from '@/types'
import type { FilterConditionDef, SortDef, TableSlice } from '@/engine/types'
import type { GridRow } from '../types'

const WINDOW_SIZE = 100
const PREFETCH_THRESHOLD = 20
const JUMP_CACHE_MAX = 500

export interface WindowedRowsState {
  totalRows: number
  getRowAtIndex: (index: number) => GridRow | null
  /** Snapshot of all currently-loaded rows keyed by absolute index (window + jump cache). */
  getLoadedRows: () => Map<number, GridRow>
  /** Ensure the rows spanning [startIndex, endIndex] get fetched (no-op if already loaded). */
  ensureRange: (startIndex: number, endIndex: number) => void
  /** Increments whenever loaded data changes; use as a memo dependency. */
  version: number
  isLoading: boolean
  error: string | null
  invalidate: () => void
  fetchRange: (offset: number, limit: number) => Promise<void>
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
  const jumpCacheRef = useRef<Map<number, GridRow>>(new Map())
  const generationRef = useRef(0)
  const fetchInFlightRef = useRef(false)
  // A window requested while a fetch is in flight (e.g. invalidate() after materialization).
  // Without this, that request would be silently dropped and the grid could stay empty.
  const pendingFetchRef = useRef<{ offset: number; limit: number } | null>(null)
  // Bumped whenever loaded window data changes so consumers (the grid bridge array)
  // recompute and newly fetched rows actually appear as the user scrolls.
  const [version, setVersion] = useState(0)

  const fingerprintRef = useRef('')

  const getFingerprint = useCallback(() => {
    const filterStr = filters ? JSON.stringify(filters.conditions) + filters.logic : ''
    const sortStr = sorts ? JSON.stringify(sorts) : ''
    return `${tableId}|${filterStr}|${sortStr}|${search || ''}`
  }, [tableId, filters, sorts, search])

  useEffect(() => {
    const newFingerprint = getFingerprint()
    if (newFingerprint !== fingerprintRef.current) {
      fingerprintRef.current = newFingerprint
      generationRef.current++
      windowRef.current = { start: 0, end: 0, rows: new Map() }
      jumpCacheRef.current.clear()
      fetchWindow(0, WINDOW_SIZE)
    }
  }, [getFingerprint])

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
      // Remember the most recent request so it runs once the current fetch settles.
      pendingFetchRef.current = { offset, limit }
      return
    }
    fetchInFlightRef.current = true
    setIsLoading(true)

    const gen = generationRef.current

    try {
      await ensureTableMaterialized(tableId)
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

      windowRef.current = { start: offset, end: offset + slice.rows.length, rows: newRows }
      setTotalRows(slice.totalRows)
      setError(null)
      setVersion(v => v + 1)
    } catch (e) {
      if (gen !== generationRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      fetchInFlightRef.current = false
      setIsLoading(false)
      // Service the latest request that arrived while this fetch was running.
      const pending = pendingFetchRef.current
      if (pending) {
        pendingFetchRef.current = null
        void fetchWindow(pending.offset, pending.limit)
      }
    }
  }, [tableId, buildFilterDefs, sorts, search, columns])

  const getRowAtIndex = useCallback((index: number): GridRow | null => {
    const win = windowRef.current
    const row = win.rows.get(index)
    if (row) return row

    const cached = jumpCacheRef.current.get(index)
    if (cached) return cached

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
    jumpCacheRef.current.forEach((row, idx) => merged.set(idx, row))
    windowRef.current.rows.forEach((row, idx) => merged.set(idx, row))
    return merged
  }, [])

  const ensureRange = useCallback((startIndex: number, endIndex: number) => {
    // getRowAtIndex carries the window-advance/prefetch logic; probing the visible
    // range's edges is enough to keep the loaded window aligned with the viewport.
    getRowAtIndex(Math.max(0, startIndex))
    getRowAtIndex(Math.max(0, endIndex))
  }, [getRowAtIndex])

  const invalidate = useCallback(() => {
    generationRef.current++
    windowRef.current = { start: 0, end: 0, rows: new Map() }
    jumpCacheRef.current.clear()
    fetchWindow(0, WINDOW_SIZE)
  }, [fetchWindow])

  const fetchRange = useCallback(async (offset: number, limit: number) => {
    try {
      await ensureTableMaterialized(tableId)
      const engine = getEngine()
      const filterDefs = buildFilterDefs()

      let slice: TableSlice
      if (filterDefs || sorts?.length || search) {
        slice = await engine.getFilteredSlice({ tableId, filters: filterDefs, sorts, search, offset, limit, columns })
      } else {
        slice = await engine.getSlice(tableId, offset, limit, columns)
      }

      slice.rows.forEach((row, idx) => {
        const absIdx = offset + idx
        const gridRow: GridRow = { __rowId: (row.__rowId as string) || `row_${absIdx}`, ...row }

        if (absIdx >= windowRef.current.start && absIdx < windowRef.current.end) {
          windowRef.current.rows.set(absIdx, gridRow)
        } else {
          jumpCacheRef.current.set(absIdx, gridRow)
          if (jumpCacheRef.current.size > JUMP_CACHE_MAX) {
            const firstKey = jumpCacheRef.current.keys().next().value
            if (firstKey !== undefined) jumpCacheRef.current.delete(firstKey)
          }
        }
      })

      setTotalRows(slice.totalRows)
      setVersion(v => v + 1)
    } catch (e) {
      console.error('[useWindowedRows] fetchRange error:', e)
    }
  }, [tableId, buildFilterDefs, sorts, search, columns])

  useEffect(() => {
    fetchWindow(0, WINDOW_SIZE)
  }, [])

  return { totalRows, getRowAtIndex, getLoadedRows, ensureRange, version, isLoading, error, invalidate, fetchRange }
}
