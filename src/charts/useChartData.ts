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

  // Resolve a column reference (id or name) to get the duckDbName for queries.
  // Returns the duckDbName (what DuckDB actually uses) and the display name.
  const getColumnForDuckDB = (columnRef: string): { duckDbName: string; name: string } | null => {
    if (!columns || columns.length === 0) {
      // If no columns schema, assume columnRef is what we need
      return { duckDbName: columnRef, name: columnRef }
    }
    
    // First try to find by ID
    const colById = columns.find(c => c.id === columnRef)
    if (colById) {
      return { 
        duckDbName: colById.duckDbName || colById.id, // fallback to id if duckDbName not set
        name: colById.name 
      }
    }
    
    // Fallback: check if columnRef is a column name
    const colByName = columns.find(c => c.name === columnRef)
    if (colByName) {
      return { 
        duckDbName: colByName.duckDbName || colByName.name, // for derived tables, name = duckDbName
        name: colByName.name 
      }
    }
    
    // Fallback: case-insensitive name match
    const colByNameLower = columns.find(c => c.name.toLowerCase() === columnRef.toLowerCase())
    if (colByNameLower) {
      return { 
        duckDbName: colByNameLower.duckDbName || colByNameLower.name,
        name: colByNameLower.name 
      }
    }
    
    // Column not found
    return null
  }

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      if (!sourceTableId || !config.xAxis || !config.yAxis) {
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
        // Ensure source table is materialized first
        await ensureTableMaterialized(sourceTableId)

        const engine = getEngine()
        await engine.init()

        // Resolve column references to get duckDbName for queries
        const xAxisCol = getColumnForDuckDB(config.xAxis)
        const yAxisCol = getColumnForDuckDB(config.yAxis)
        const groupByCol = config.groupBy ? getColumnForDuckDB(config.groupBy) : undefined

        // Validate columns were resolved
        if (!xAxisCol) {
          throw new Error(`X-axis column "${config.xAxis}" not found. Available columns: ${columns?.map(c => `${c.name} (${c.duckDbName || c.id})`).join(', ')}`)
        }
        if (!yAxisCol) {
          throw new Error(`Y-axis column "${config.yAxis}" not found. Available columns: ${columns?.map(c => `${c.name} (${c.duckDbName || c.id})`).join(', ')}`)
        }
        if (config.groupBy && !groupByCol) {
          throw new Error(`Group-by column "${config.groupBy}" not found. Available columns: ${columns?.map(c => `${c.name} (${c.duckDbName || c.id})`).join(', ')}`)
        }

        // Use duckDbName (what DuckDB actually expects) for queries
        const xAxisDuckDb = xAxisCol.duckDbName
        const yAxisDuckDb = yAxisCol.duckDbName
        const groupByDuckDb = groupByCol?.duckDbName

        // If there's a groupBy or aggregation, use aggregation query
        if (groupByDuckDb || config.aggregation) {
          const aggResult = await engine.getAggregation(sourceTableId, {
            groupBy: groupByDuckDb ? [groupByDuckDb] : [xAxisDuckDb],
            aggregations: [{
              column: yAxisDuckDb,
              operation: (config.aggregation as 'sum' | 'avg' | 'count' | 'min' | 'max') || 'sum',
              alias: config.yAxis, // Keep original config key as alias for chart rendering
            }],
          })

          if (!cancelled) {
            // Convert to chart data format
            // The result columns are duckDbNames, map back to config keys for chart rendering
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
          // Get raw slice data (limited to 100 rows for charts)
          const slice = await engine.getSlice(sourceTableId, 0, 100)
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
          
          // Provide clearer error for DuckDB binder errors
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
    columns, // Re-fetch if columns change
  ])

  return { data, loading, error, refetch }
}
