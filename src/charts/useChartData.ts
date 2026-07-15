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

  const getColumnForDuckDB = useCallback((columnRef: string): { duckDbName: string; name: string } | null => {
    if (!columns || columns.length === 0) {
      return { duckDbName: columnRef, name: columnRef }
    }
    
    const colById = columns.find(c => c.id === columnRef)
    if (colById) {
      return { duckDbName: colById.name, name: colById.name }
    }
    
    const colByName = columns.find(c => c.name === columnRef)
    if (colByName) {
      return { duckDbName: colByName.name, name: colByName.name }
    }
    
    const colByNameLower = columns.find(c => c.name.toLowerCase() === columnRef.toLowerCase())
    if (colByNameLower) {
      return { duckDbName: colByNameLower.name, name: colByNameLower.name }
    }
    
    return null
  }, [columns])

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      const isCountAggregation = config.aggregation === 'count'
      if (!sourceTableId || !config.xAxis || (!config.yAxis && !isCountAggregation)) {
        setLoading(false)
        return
      }

      if (!columns || columns.length === 0) {
        setLoading(true)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const materialization = await ensureTableMaterialized(sourceTableId)
        if (materialization.status === 'error') {
          if (!cancelled) {
            setData([])
            setError(materialization.error || 'Failed to materialize table')
          }
          return
        }
        if (materialization.status === 'loading') {
          if (!cancelled) {
            setData([])
            setError('Table data changed while loading. Please try again.')
          }
          return
        }

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

        const xAxisDuckDb = xAxisCol.duckDbName
        const yAxisDuckDb = yAxisCol?.duckDbName
        const groupByDuckDb = groupByCol?.duckDbName

        if (groupByDuckDb || config.aggregation) {
          const aggColumn = yAxisDuckDb ?? xAxisDuckDb
          const valueKey = config.yAxis ?? COUNT_VALUE_KEY
          const aggResult = await engine.getAggregation(sourceTableId, {
            groupBy: groupByDuckDb ? [groupByDuckDb] : [xAxisDuckDb],
            aggregations: [{
              column: aggColumn,
              operation: config.aggregation || 'sum',
              alias: valueKey,
            }],
          })

          if (!cancelled) {
            const chartData = aggResult.rows.map(row => {
              const obj: Record<string, CellValue> = {}
              aggResult.columns.forEach((col, i) => {
                const key = col === xAxisDuckDb ? config.xAxis! : col
                obj[key] = row[i]
              })
              return obj
            })
            setData(chartData)
          }
        } else {
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
    sourceVersionHash,
    refetchTrigger,
    columns,
    getColumnForDuckDB,
  ])

  return { data, loading, error, refetch }
}
