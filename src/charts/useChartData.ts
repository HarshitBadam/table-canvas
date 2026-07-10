import { useState, useEffect, useCallback } from 'react'
import { CellValue, ChartConfig, ColumnSchema } from '@/types'
import { getEngine } from '@/engine/EngineAdapter'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { COUNT_VALUE_KEY } from './chartShared'

export interface ChartDataResult {
  data: Record<string, CellValue>[]
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * @param config - Chart configuration (xAxis, yAxis, aggregation, groupBy) — uses column IDs
 * @param sourceVersionHash - Optional version hash for reactivity (triggers re-fetch when changed)
 * @param columns - Optional column schema for converting IDs to names for DuckDB queries
 */
export function useChartData(
  sourceTableId: string,
  config: ChartConfig,
  sourceVersionHash?: string,
  columns?: ColumnSchema[]
): ChartDataResult {
  const [data, setData] = useState<Record<string, CellValue>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const refetch = useCallback(() => setRefetchTrigger(prev => prev + 1), [])

  // DuckDB columns are always created from the column's display `name` (see
  // EngineAdapter.loadTable / derivedTableComputation), so queries must reference
  // `col.name` — NOT `duckDbName`, which is stale (= the id) for source tables and
  // would produce "column not found" Binder errors.
  const getColumnForDuckDB = useCallback((columnRef: string): { duckDbName: string; name: string } | null => {
    if (!columns || columns.length === 0) {
      // If no columns schema, assume columnRef is what we need
      return { duckDbName: columnRef, name: columnRef }
    }
    
    const colById = columns.find(c => c.id === columnRef)
    if (colById) {
      return { duckDbName: colById.name, name: colById.name }
    }
    
    // Fallback: check if columnRef is a column name
    const colByName = columns.find(c => c.name === columnRef)
    if (colByName) {
      return { duckDbName: colByName.name, name: colByName.name }
    }
    
    // Fallback: case-insensitive name match
    const colByNameLower = columns.find(c => c.name.toLowerCase() === columnRef.toLowerCase())
    if (colByNameLower) {
      return { duckDbName: colByNameLower.name, name: colByNameLower.name }
    }
    
    return null
  }, [columns])

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      // Count charts (histograms) only need an x-axis; all other charts need both axes.
      const isCountAggregation = config.aggregation === 'count'
      if (!sourceTableId || !config.xAxis || (!config.yAxis && !isCountAggregation)) {
        setLoading(false)
        return
      }

      // Wait for columns to be loaded before attempting query
      if (!columns || columns.length === 0) {
        // Columns not loaded yet, don't show error, just keep loading
        setLoading(true)
        return
      }

      setLoading(true)
      setError(null)

      try {
        await ensureTableMaterialized(sourceTableId)

        const engine = getEngine()
        await engine.init()

        const xAxisCol = getColumnForDuckDB(config.xAxis)
        const yAxisCol = config.yAxis ? getColumnForDuckDB(config.yAxis) : null
        const groupByCol = config.groupBy ? getColumnForDuckDB(config.groupBy) : undefined

        if (!xAxisCol) {
          throw new Error(`X-axis column "${config.xAxis}" not found. Available columns: ${columns?.map(c => `${c.name} (${c.id})`).join(', ')}`)
        }
        if (config.yAxis && !yAxisCol) {
          throw new Error(`Y-axis column "${config.yAxis}" not found. Available columns: ${columns?.map(c => `${c.name} (${c.id})`).join(', ')}`)
        }
        if (config.groupBy && !groupByCol) {
          throw new Error(`Group-by column "${config.groupBy}" not found. Available columns: ${columns?.map(c => `${c.name} (${c.id})`).join(', ')}`)
        }

        // DuckDB columns are keyed by display name (see getColumnForDuckDB).
        const xAxisDuckDb = xAxisCol.duckDbName
        const yAxisDuckDb = yAxisCol?.duckDbName
        const groupByDuckDb = groupByCol?.duckDbName

        if (groupByDuckDb || config.aggregation) {
          // Count charts with no explicit y-axis count the grouped column itself.
          const aggColumn = yAxisDuckDb ?? xAxisDuckDb
          const valueKey = config.yAxis ?? COUNT_VALUE_KEY
          const aggResult = await engine.getAggregation(sourceTableId, {
            groupBy: groupByDuckDb ? [groupByDuckDb] : [xAxisDuckDb],
            aggregations: [{
              column: aggColumn,
              operation: (config.aggregation as 'sum' | 'avg' | 'count' | 'min' | 'max') || 'sum',
              alias: valueKey, // Keep original config key (or count sentinel) as alias
            }],
          })

          if (!cancelled) {
            const chartData = aggResult.rows.map(row => {
              const obj: Record<string, CellValue> = {}
              aggResult.columns.forEach((col, i) => {
                // Map the groupBy column back to xAxis config key for chart rendering
                const key = col === xAxisDuckDb ? config.xAxis! : col
                obj[key] = row[i]
              })
              return obj
            })
            setData(chartData)
          }
        } else {
          // Get raw slice data (limited to 100 rows for charts).
          // Pass columns so rows come back keyed by column id (matching config.xAxis/yAxis),
          // consistent with the aggregation path above.
          const slice = await engine.getSlice(sourceTableId, 0, 100, columns)
          if (!cancelled) {
            setData(slice.rows)
          }
        }
      } catch (err) {
        if (!cancelled) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load chart data'
          console.error('[useChartData] Error fetching chart data:', errorMsg)
          console.error('[useChartData] Config:', { xAxis: config.xAxis, yAxis: config.yAxis, aggregation: config.aggregation })
          console.error('[useChartData] Available columns:', columns?.map(c => ({ id: c.id, name: c.name })))
          
          if (errorMsg.includes('Binder Error') || errorMsg.includes('not found in FROM clause') || errorMsg.includes('does not exist')) {
            setError(`Column reference error: The chart configuration references a column that no longer exists. Please reconfigure the chart axes.`)
          } else if (errorMsg.includes('not found')) {
            setError(errorMsg)
          } else {
            setError(`Failed to load chart data: ${errorMsg}`)
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [
    sourceTableId,
    config.xAxis,
    config.yAxis,
    config.groupBy,
    config.aggregation,
    sourceVersionHash, // Re-fetch when source data changes
    refetchTrigger,
    columns,
    getColumnForDuckDB,
  ])

  return { data, loading, error, refetch }
}
