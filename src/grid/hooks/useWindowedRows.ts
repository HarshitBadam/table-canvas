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

interface WindowRequest {
  tableId: string
  columns: ColumnSchema[]
  filterDefs: FilterConditionDef[] | undefined
  sorts: SortDef[] | undefined
  search: string | undefined
  offset: number
  limit: number
  generation: number
}

function buildFilterDefs(
  filters: ViewFilterConfig | null,
  columns: ColumnSchema[],
): FilterConditionDef[] | undefined {
  if (!filters || filters.conditions.length === 0) return undefined
  const colMap = new Map(columns.map(column => [column.id, column]))
  return filters.conditions.map(condition => {
    const column = colMap.get(condition.columnId)
    return {
      column: column?.name || condition.columnId,
      operator: condition.operator,
      value: condition.value,
      value2: condition.value2,
      columnType: column?.type,
    }
  })
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
  const pendingFetchRef = useRef<WindowRequest | null>(null)
  const replaceOnNextFetchRef = useRef(false)
  const [version, setVersion] = useState(0)

  const fingerprintRef = useRef('')
  const filterStr = filters ? JSON.stringify([filters.conditions, filters.logic]) : ''
  const sortStr = sorts ? JSON.stringify(sorts) : ''
  const columnStr = JSON.stringify(columns.map(({ id, name, type }) => ({ id, name, type })))
  const fingerprint = `${tableId}|${filterStr}|${sortStr}|${search || ''}|${columnStr}`
  const latestConfigRef = useRef<Omit<WindowRequest, 'offset' | 'limit' | 'generation'>>({
    tableId,
    columns,
    filterDefs: buildFilterDefs(filters, columns),
    sorts,
    search,
  })
  latestConfigRef.current = {
    tableId,
    columns,
    filterDefs: buildFilterDefs(filters, columns),
    sorts,
    search,
  }
  const requestPumpRef = useRef<(request: WindowRequest) => void>(() => undefined)

  const pumpRequest = useCallback((request: WindowRequest) => {
    if (fetchInFlightRef.current) {
      pendingFetchRef.current = request
      return
    }
    fetchInFlightRef.current = true
    setIsLoading(true)

    void (async () => {
      try {
        const materialization = await ensureTableMaterialized(request.tableId)
        if (materialization.status === 'error') {
          throw new Error(materialization.error || 'Failed to materialize table')
        }
        if (materialization.status === 'loading') {
          throw new Error('Table data changed while loading. Please try again.')
        }
        const engine = getEngine()
        let slice: TableSlice

        if (request.filterDefs || request.sorts?.length || request.search) {
          slice = await engine.getFilteredSlice({
            tableId: request.tableId,
            filters: request.filterDefs,
            sorts: request.sorts,
            search: request.search,
            offset: request.offset,
            limit: request.limit,
            columns: request.columns,
          })
        } else {
          slice = await engine.getSlice(
            request.tableId,
            request.offset,
            request.limit,
            request.columns,
          )
        }

        if (request.generation !== generationRef.current) return

        const newRows = new Map<number, GridRow>()
        slice.rows.forEach((row, idx) => {
          const gridRow: GridRow = {
            __rowId: (row.__rowId as string) || `row_${request.offset + idx}`,
            ...row,
          }
          newRows.set(request.offset + idx, gridRow)
        })

        const previous = windowRef.current
        const nextEnd = request.offset + slice.rows.length
        const isAdjacent = request.offset <= previous.end + PREFETCH_THRESHOLD
          && nextEnd >= previous.start - PREFETCH_THRESHOLD
        const shouldReplace = replaceOnNextFetchRef.current
        replaceOnNextFetchRef.current = false
        const mergedRows = !shouldReplace && isAdjacent
          ? new Map(previous.rows)
          : new Map<number, GridRow>()
        newRows.forEach((row, index) => mergedRows.set(index, row))

        const maxCachedRows = WINDOW_SIZE * 3
        if (mergedRows.size > maxCachedRows) {
          const center = request.offset + Math.floor(slice.rows.length / 2)
          const retained = [...mergedRows.entries()]
            .sort(([left], [right]) => Math.abs(left - center) - Math.abs(right - center))
            .slice(0, maxCachedRows)
          mergedRows.clear()
          retained.forEach(([index, row]) => mergedRows.set(index, row))
        }

        const cachedIndexes = [...mergedRows.keys()]
        windowRef.current = {
          start: cachedIndexes.length > 0 ? Math.min(...cachedIndexes) : request.offset,
          end: cachedIndexes.length > 0 ? Math.max(...cachedIndexes) + 1 : nextEnd,
          rows: mergedRows,
        }
        setTotalRows(slice.totalRows)
        setError(null)
        setVersion(v => v + 1)
      } catch (e) {
        if (request.generation !== generationRef.current) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        fetchInFlightRef.current = false
        const pending = pendingFetchRef.current
        pendingFetchRef.current = null
        if (pending) {
          requestPumpRef.current(pending)
        } else {
          setIsLoading(false)
        }
      }
    })()
  }, [])
  requestPumpRef.current = pumpRequest

  const fetchWindow = useCallback((offset: number, limit: number) => {
    requestPumpRef.current({
      ...latestConfigRef.current,
      offset,
      limit,
      generation: generationRef.current,
    })
  }, [])

  useEffect(() => {
    if (fingerprint === fingerprintRef.current) return
    const previousFingerprint = fingerprintRef.current
    fingerprintRef.current = fingerprint
    generationRef.current++
    replaceOnNextFetchRef.current = true
    if (!previousFingerprint || !previousFingerprint.startsWith(`${tableId}|`)) {
      windowRef.current = { start: 0, end: 0, rows: new Map() }
      setTotalRows(0)
      setVersion(v => v + 1)
    }
    void fetchWindow(0, WINDOW_SIZE)
  }, [fetchWindow, fingerprint, tableId])

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
    pendingFetchRef.current = null
    replaceOnNextFetchRef.current = true
    setError(null)
    void fetchWindow(0, WINDOW_SIZE)
  }, [fetchWindow])

  return { totalRows, getRowAtIndex, getLoadedRows, ensureRange, version, isLoading, error, invalidate }
}
