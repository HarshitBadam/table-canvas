/**
 * Shared hook for fetching chart data with reactivity
 * 
 * This hook fetches data for charts from DuckDB and automatically
 * re-fetches when the source table's data changes (via version hash).
 */

import { useState, useEffect } from 'react'
import { CellValue, ChartConfig } from '@/lib/types'
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
 * @param config - Chart configuration (xAxis, yAxis, aggregation, groupBy)
 * @param sourceVersionHash - Optional version hash for reactivity (triggers re-fetch when changed)
 */
export function useChartData(
  sourceTableId: string,
  config: ChartConfig,
  sourceVersionHash?: string
): ChartDataResult {
  const [data, setData] = useState<Record<string, CellValue>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const refetch = () => setRefetchTrigger(prev => prev + 1)

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

        // If there's a groupBy or aggregation, use aggregation query
        if (config.groupBy || config.aggregation) {
          const aggResult = await engine.getAggregation(sourceTableId, {
            groupBy: config.groupBy ? [config.groupBy] : [config.xAxis],
            aggregations: [{
              column: config.yAxis,
              operation: (config.aggregation as 'sum' | 'avg' | 'count' | 'min' | 'max') || 'sum',
              alias: config.yAxis,
            }],
          })

          if (!cancelled) {
            // Convert to chart data format
            const chartData = aggResult.rows.map(row => {
              const obj: Record<string, CellValue> = {}
              aggResult.columns.forEach((col, i) => {
                obj[col] = row[i]
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
  ])

  return { data, loading, error, refetch }
}
