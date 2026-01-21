/**
 * Preview Service
 * Generates lazy-loaded previews for suggestions
 */

import { useDataStore } from '@/state/dataStore'
import { useProjectStore } from '@/state/projectStore'
import type { 
  Suggestion, 
  PreviewData, 
  SuggestionPreview,
  CellValue,
  TransformDef,
} from '@/lib/types'

// Preview cache
const previewCache = new Map<string, SuggestionPreview>()

// Max rows for preview
const MAX_PREVIEW_ROWS = 5

/**
 * Generate a cache key for a preview
 */
function getPreviewCacheKey(suggestion: Suggestion): string {
  return `${suggestion.id}:${suggestion.context.tableVersionHash}`
}

/**
 * Get preview from cache
 */
export function getCachedPreview(suggestion: Suggestion): SuggestionPreview | undefined {
  return previewCache.get(getPreviewCacheKey(suggestion))
}

/**
 * Generate preview for a suggestion
 */
export async function generatePreview(suggestion: Suggestion): Promise<SuggestionPreview> {
  const cacheKey = getPreviewCacheKey(suggestion)
  
  // Check cache
  const cached = previewCache.get(cacheKey)
  if (cached && cached.status === 'ready') {
    return cached
  }

  // Set loading state
  const loadingState: SuggestionPreview = { status: 'loading' }
  previewCache.set(cacheKey, loadingState)

  try {
    let data: PreviewData | undefined

    switch (suggestion.action.kind) {
      case 'applyPatch':
        data = await generateCleaningPreview(suggestion)
        break
      
      case 'createDerivedTable':
        data = await generateDerivedTablePreview(suggestion)
        break
      
      case 'createChart':
        data = await generateChartPreview(suggestion)
        break
      
      case 'launchRecipe':
        data = await generateRecipePreview(suggestion)
        break
    }

    const result: SuggestionPreview = {
      status: 'ready',
      data,
    }
    previewCache.set(cacheKey, result)
    return result

  } catch (error) {
    const errorResult: SuggestionPreview = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    previewCache.set(cacheKey, errorResult)
    return errorResult
  }
}

/**
 * Generate before/after preview for cleaning operations
 */
async function generateCleaningPreview(suggestion: Suggestion): Promise<PreviewData> {
  const { tableId, columnId } = suggestion.context
  
  if (!columnId) {
    return {
      kind: 'beforeAfter',
      rows: [],
    }
  }

  // Get sample data from the table
  const tableData = useDataStore.getState().tableData[tableId]
  if (!tableData?.rows) {
    return {
      kind: 'beforeAfter',
      rows: [],
    }
  }

  // Find rows that would be affected by the cleaning
  const affectedRows: Array<{ before: CellValue; after: CellValue }> = []
  
  for (const row of tableData.rows.slice(0, 100)) {
    const value = row[columnId]
    const afterValue = simulateCleaningOperation(value, suggestion)
    
    if (value !== afterValue) {
      affectedRows.push({
        before: value,
        after: afterValue,
      })
      
      if (affectedRows.length >= MAX_PREVIEW_ROWS) {
        break
      }
    }
  }

  return {
    kind: 'beforeAfter',
    rows: affectedRows,
  }
}

/**
 * Simulate what a cleaning operation would do to a value
 */
function simulateCleaningOperation(value: CellValue, suggestion: Suggestion): CellValue {
  if (value === null || value === undefined) {
    return value
  }

  const title = suggestion.title.toLowerCase()
  const strValue = String(value)

  // Trim whitespace
  if (title.includes('trim')) {
    return strValue.trim()
  }

  // Normalize casing
  if (title.includes('normalize') || title.includes('casing')) {
    // Title case
    return strValue
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Convert to number
  if (title.includes('convert') && title.includes('number')) {
    const cleaned = strValue.replace(/[,$%\s]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? value : num
  }

  // Fill missing
  if (title.includes('fill') && title.includes('missing')) {
    if (value === null || value === '' || value === undefined) {
      return '(filled)'
    }
    return value
  }

  return value
}

/**
 * Get source table ID from a transform definition
 */
function getSourceTableIdFromTransform(transform: TransformDef): string | null {
  if ('sourceTableId' in transform) {
    return transform.sourceTableId
  }
  if ('leftTableId' in transform) {
    return transform.leftTableId
  }
  if ('sourceTableIds' in transform && transform.sourceTableIds.length > 0) {
    return transform.sourceTableIds[0]
  }
  return null
}

/**
 * Generate preview for derived table operations
 */
async function generateDerivedTablePreview(suggestion: Suggestion): Promise<PreviewData> {
  const action = suggestion.action
  if (action.kind !== 'createDerivedTable') {
    return { kind: 'tableSample', columns: [], rows: [] }
  }

  const transform = action.transform
  const tableId = getSourceTableIdFromTransform(transform)
  
  if (!tableId) {
    return { kind: 'tableSample', columns: [], rows: [] }
  }
  
  const tableData = useDataStore.getState().tableData[tableId]
  const node = useProjectStore.getState().getTableNode(tableId)

  if (!tableData?.rows || !node?.schema) {
    return { kind: 'tableSample', columns: [], rows: [] }
  }

  // Generate preview based on transform type
  switch (transform.type) {
    case 'group_summarize':
      return generateGroupSummarizePreview(transform, tableData.rows, node.schema)
    
    case 'calculated_column':
      return generateCalculatedColumnPreview(transform, tableData.rows, node.schema)
    
    case 'filter':
      return generateFilterPreview(transform, tableData.rows, node.schema)
    
    default:
      return {
        kind: 'tableSample',
        columns: node.schema.columns.map(c => c.name),
        rows: tableData.rows.slice(0, MAX_PREVIEW_ROWS).map(row => 
          node.schema!.columns.map(c => row[c.id])
        ),
      }
  }
}

/**
 * Generate preview for group/summarize transforms
 */
function generateGroupSummarizePreview(
  transform: Extract<TransformDef, { type: 'group_summarize' }>,
  rows: Array<Record<string, CellValue>>,
  schema: { columns: Array<{ id: string; name: string }> }
): PreviewData {
  // Simple client-side aggregation for preview
  const groups = new Map<string, Record<string, number>>()
  
  for (const row of rows) {
    const groupKey = transform.groupByColumns.map(colId => String(row[colId] ?? '')).join('|')
    
    if (!groups.has(groupKey)) {
      const groupData: Record<string, number> = {}
      transform.aggregations.forEach(agg => {
        groupData[agg.alias] = 0
        groupData[`${agg.alias}_count`] = 0
      })
      groups.set(groupKey, groupData)
    }
    
    const groupData = groups.get(groupKey)!
    transform.aggregations.forEach(agg => {
      const value = row[agg.columnId]
      if (typeof value === 'number') {
        if (agg.operation === 'sum' || agg.operation === 'avg') {
          groupData[agg.alias] += value
          groupData[`${agg.alias}_count`]++
        } else if (agg.operation === 'count') {
          groupData[agg.alias]++
        } else if (agg.operation === 'min') {
          groupData[agg.alias] = Math.min(groupData[agg.alias] || Infinity, value)
        } else if (agg.operation === 'max') {
          groupData[agg.alias] = Math.max(groupData[agg.alias] || -Infinity, value)
        }
      } else if (agg.operation === 'count') {
        groupData[agg.alias]++
      }
    })
  }

  // Compute averages
  groups.forEach((groupData) => {
    transform.aggregations.forEach(agg => {
      if (agg.operation === 'avg' && groupData[`${agg.alias}_count`] > 0) {
        groupData[agg.alias] = groupData[agg.alias] / groupData[`${agg.alias}_count`]
      }
    })
  })

  // Build preview rows
  const groupByColNames = transform.groupByColumns.map(id => 
    schema.columns.find(c => c.id === id)?.name ?? id
  )
  const aggColNames = transform.aggregations.map(a => a.alias)
  const columns = [...groupByColNames, ...aggColNames]

  const previewRows: CellValue[][] = []
  let count = 0
  
  groups.forEach((groupData, groupKey) => {
    if (count >= MAX_PREVIEW_ROWS) return
    
    const groupValues = groupKey.split('|')
    const aggValues = transform.aggregations.map(a => 
      Math.round(groupData[a.alias] * 100) / 100
    )
    previewRows.push([...groupValues, ...aggValues])
    count++
  })

  return {
    kind: 'aggregateSample',
    columns,
    rows: previewRows,
  }
}

/**
 * Generate preview for calculated column transforms
 */
function generateCalculatedColumnPreview(
  transform: Extract<TransformDef, { type: 'calculated_column' }>,
  rows: Array<Record<string, CellValue>>,
  schema: { columns: Array<{ id: string; name: string }> }
): PreviewData {
  // For now, just show that a new column would be added
  const existingCols = schema.columns.map(c => c.name)
  const columns = [...existingCols, transform.newColumnName]

  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS).map(row => {
    const values = schema.columns.map(c => row[c.id])
    // Add placeholder for calculated column
    values.push('(calculated)')
    return values
  })

  return {
    kind: 'tableSample',
    columns,
    rows: previewRows,
  }
}

/**
 * Generate preview for filter transforms
 */
function generateFilterPreview(
  transform: Extract<TransformDef, { type: 'filter' }>,
  rows: Array<Record<string, CellValue>>,
  schema: { columns: Array<{ id: string; name: string }> }
): PreviewData {
  // Simple filtering logic
  const matchingRows = rows.filter(row => {
    return transform.conditions.every(cond => {
      const value = row[cond.columnId]
      
      switch (cond.operator) {
        case 'equals':
          return value === cond.value
        case 'not_equals':
          return value !== cond.value
        case 'is_null':
          return value === null || value === undefined || value === ''
        case 'is_not_null':
          return value !== null && value !== undefined && value !== ''
        case 'greater_than':
          return typeof value === 'number' && typeof cond.value === 'number' && value > cond.value
        case 'less_than':
          return typeof value === 'number' && typeof cond.value === 'number' && value < cond.value
        case 'contains':
          return typeof value === 'string' && typeof cond.value === 'string' && 
                 value.toLowerCase().includes(cond.value.toLowerCase())
        default:
          return true
      }
    })
  })

  const columns = schema.columns.map(c => c.name)
  const previewRows = matchingRows.slice(0, MAX_PREVIEW_ROWS).map(row =>
    schema.columns.map(c => row[c.id])
  )

  return {
    kind: 'tableSample',
    columns,
    rows: previewRows,
  }
}

/**
 * Generate preview for chart operations
 */
async function generateChartPreview(suggestion: Suggestion): Promise<PreviewData> {
  const action = suggestion.action
  if (action.kind !== 'createChart') {
    return { kind: 'tableSample', columns: [], rows: [] }
  }

  // For charts, we show the aggregated data that would be charted
  const { sourceTableId, config } = action.chart
  const tableData = useDataStore.getState().tableData[sourceTableId]
  const node = useProjectStore.getState().getTableNode(sourceTableId)

  if (!tableData?.rows || !node?.schema || !config.xAxis) {
    return { kind: 'tableSample', columns: [], rows: [] }
  }

  // Group by x-axis and aggregate y-axis
  const xCol = node.schema.columns.find(c => c.id === config.xAxis)
  const yCol = config.yAxis ? node.schema.columns.find(c => c.id === config.yAxis) : null

  if (!xCol) {
    return { kind: 'tableSample', columns: [], rows: [] }
  }

  const groups = new Map<string, { sum: number; count: number }>()

  for (const row of tableData.rows) {
    const xValue = String(row[config.xAxis] ?? '')
    
    if (!groups.has(xValue)) {
      groups.set(xValue, { sum: 0, count: 0 })
    }
    
    const group = groups.get(xValue)!
    group.count++
    
    if (yCol && config.yAxis) {
      const yValue = row[config.yAxis]
      if (typeof yValue === 'number') {
        group.sum += yValue
      }
    }
  }

  const columns = yCol 
    ? [xCol.name, yCol.name]
    : [xCol.name, 'Count']

  const previewRows: CellValue[][] = []
  let count = 0
  
  groups.forEach((group, xValue) => {
    if (count >= MAX_PREVIEW_ROWS) return
    
    const yValue = config.aggregation === 'count' 
      ? group.count
      : config.aggregation === 'avg' && group.count > 0
        ? Math.round(group.sum / group.count * 100) / 100
        : Math.round(group.sum * 100) / 100
    
    previewRows.push([xValue, yValue])
    count++
  })

  return {
    kind: 'aggregateSample',
    columns,
    rows: previewRows,
  }
}

/**
 * Generate preview for recipe operations
 */
async function generateRecipePreview(suggestion: Suggestion): Promise<PreviewData> {
  const action = suggestion.action
  if (action.kind !== 'launchRecipe') {
    return { kind: 'recipeOutputs', outputs: [] }
  }

  // Define expected outputs for each recipe
  const recipeOutputs: Record<string, Array<{ type: 'table' | 'chart'; name: string }>> = {
    variance_analysis: [
      { type: 'table', name: 'Variance Table' },
      { type: 'chart', name: 'Variance Chart' },
    ],
    period_over_period: [
      { type: 'table', name: 'Period Summary' },
      { type: 'chart', name: 'Trend Line' },
    ],
    trend_summary: [
      { type: 'table', name: 'Monthly Summary' },
      { type: 'chart', name: 'Trend Chart' },
    ],
    contribution: [
      { type: 'table', name: 'Contribution Table' },
      { type: 'chart', name: 'Pareto Chart' },
    ],
    reconciliation: [
      { type: 'table', name: 'Match Summary' },
      { type: 'table', name: 'Unmatched Records' },
    ],
  }

  return {
    kind: 'recipeOutputs',
    outputs: recipeOutputs[action.recipeId] ?? [
      { type: 'table', name: 'Output Table' },
    ],
  }
}

/**
 * Clear preview cache for a table
 */
export function clearPreviewCache(tableId?: string): void {
  if (!tableId) {
    previewCache.clear()
    return
  }

  // Clear entries for this table
  for (const key of previewCache.keys()) {
    if (key.includes(tableId)) {
      previewCache.delete(key)
    }
  }
}

/**
 * Hook for using preview in components
 */
export function usePreview(suggestion: Suggestion | null) {
  const cached = suggestion ? getCachedPreview(suggestion) : undefined
  
  const loadPreview = async () => {
    if (!suggestion) return
    return generatePreview(suggestion)
  }

  return {
    preview: cached,
    loadPreview,
    isLoading: cached?.status === 'loading',
    isReady: cached?.status === 'ready',
    error: cached?.status === 'error' ? cached.error : null,
  }
}

