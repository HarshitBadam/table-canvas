/**
 * Shared hook for fetching chart data with reactivity
 * 
 * This hook fetches data for charts from DuckDB and automatically
 * re-fetches when the source table's data changes (via version hash).
 */

import { useState, useEffect } from 'react'
import { CellValue, ChartConfig, ColumnSchema } from '@/lib/types'
import { getEngine } from '@/engine/EngineAdapter'
import { ensureTableMaterialized } from '@/engine/materializationService'

export interface ChartDataResult {
  data: Record<string, CellValue>[]
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Hook to fetch chart data from a source table
 * 
 * @param sourceTableId - The ID of the source table
 * @param config - Chart configuration (xAxis, yAxis, aggregation, groupBy) - uses column IDs
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

  const refetch = () => setRefetchTrigger(prev => prev + 1)

  // Build a map from column ID to column name
  // DuckDB tables use column names, but chart config stores column IDs
  const getColumnName = (columnId: string): string => {
    if (!columns) return columnId
    const col = columns.find(c => c.id === columnId)
    return col?.name || columnId
  }

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      if (!sourceTableId || !config.xAxis || !config.yAxis) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Ensure source table is materialized first
        await ensureTableMaterialized(sourceTableId)

        const engine = getEngine()
        await engine.init()

        // Convert column IDs to names for DuckDB queries
        const xAxisName = getColumnName(config.xAxis)
        const yAxisName = getColumnName(config.yAxis)
        const groupByName = config.groupBy ? getColumnName(config.groupBy) : undefined

        // If there's a groupBy or aggregation, use aggregation query
        if (groupByName || config.aggregation) {
          const aggResult = await engine.getAggregation(sourceTableId, {
            groupBy: groupByName ? [groupByName] : [xAxisName],
            aggregations: [{
              column: yAxisName,
              operation: (config.aggregation as 'sum' | 'avg' | 'count' | 'min' | 'max') || 'sum',
              alias: config.yAxis, // Keep original ID as alias for chart rendering
            }],
          })

          if (!cancelled) {
            // Convert to chart data format, mapping column names back to IDs
            const chartData = aggResult.rows.map(row => {
              const obj: Record<string, CellValue> = {}
              aggResult.columns.forEach((col, i) => {
                // Map the groupBy column back to xAxis ID for chart rendering
                const key = col === xAxisName ? config.xAxis : col
                obj[key] = row[i]
              })
              return obj
            })
            setData(chartData)
          }
        } else {
          // Get raw slice data (limited to 100 rows for charts)
          const slice = await engine.getSlice(sourceTableId, 0, 100)
          if (!cancelled) {
            setData(slice.rows)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chart data')
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
    columns, // Re-fetch if columns change
  ])

  return { data, loading, error, refetch }
}
