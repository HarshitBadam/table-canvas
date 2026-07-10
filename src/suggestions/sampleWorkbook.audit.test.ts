import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkbookSheet, readWorkbook } from '@/engine/fileParsers'
import { generateSuggestions } from './engine'
import { RECIPE_CONFIGS } from './recipeConfigs'
import type { ColumnProfile, ColumnSchema, Suggestion } from '@/types'
import type { TableRow } from '@/state/dataStore'

const workbookPath = resolve(
  process.cwd(),
  process.env.SAMPLE_WORKBOOK || 'data/sample_workbook.xlsx',
)
const workbookExists = existsSync(workbookPath)

function quantile(values: number[], percentile: number): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * percentile
  const lower = Math.floor(index)
  const fraction = index - lower
  return sorted[lower + 1] === undefined
    ? sorted[lower]
    : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower])
}

function profileColumn(column: ColumnSchema, rows: TableRow[]): ColumnProfile {
  const values = rows.map((row) => row[column.id])
  const present = values.filter((value) => value !== null && value !== '')
  const counts = new Map<string, { value: typeof present[number]; count: number }>()
  for (const value of present) {
    const key = `${typeof value}:${String(value)}`
    const entry = counts.get(key)
    counts.set(key, entry ? { ...entry, count: entry.count + 1 } : { value, count: 1 })
  }
  const topValues = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 25)
  const missingCount = rows.length - present.length
  const numericValues = present.filter((value): value is number => typeof value === 'number')
  const dateValues = column.type === 'date' || column.type === 'datetime'
    ? present.map((value) => Date.parse(String(value))).filter(Number.isFinite)
    : []
  const statisticalValues = numericValues.length > 0 ? numericValues : dateValues
  const mean = numericValues.length > 0
    ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
    : undefined
  const stdDev = mean === undefined
    ? undefined
    : Math.sqrt(
      numericValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numericValues.length,
    )
  const q1 = quantile(numericValues, 0.25)
  const q3 = quantile(numericValues, 0.75)

  return {
    columnId: column.id,
    missingCount,
    missingPercent: rows.length === 0 ? 0 : (missingCount / rows.length) * 100,
    distinctCount: counts.size,
    distinctCountExact: true,
    topValues,
    min: statisticalValues.length > 0 ? Math.min(...statisticalValues) : undefined,
    max: statisticalValues.length > 0 ? Math.max(...statisticalValues) : undefined,
    mean,
    stdDev,
    median: quantile(numericValues, 0.5),
    q1,
    q3,
    iqr: q1 !== undefined && q3 !== undefined ? q3 - q1 : undefined,
    completeness: rows.length === 0 ? 100 : 100 - (missingCount / rows.length) * 100,
    isKeyCandidate: rows.length > 0 && counts.size / rows.length > 0.95 && missingCount === 0,
  }
}

function referencedColumnIds(suggestion: Suggestion): string[] {
  const action = suggestion.action
  if (action.kind === 'createChart') {
    return [action.chart.config.xAxis, action.chart.config.yAxis, action.chart.config.groupBy]
      .filter((value): value is string => Boolean(value))
  }
  if (action.kind === 'createDerivedTable' && action.transform.type === 'group_summarize') {
    return [
      ...action.transform.groupByColumns,
      ...action.transform.aggregations.map((aggregation) => aggregation.columnId),
    ]
  }
  return suggestion.context.columnId ? [suggestion.context.columnId] : []
}

describe.skipIf(!workbookExists)('sample workbook suggestion audit', () => {
  const workbookBytes = readFileSync(workbookPath)
  const workbookBuffer = Uint8Array.from(workbookBytes).buffer
  const workbook = readWorkbook(workbookBuffer)

  it('imports every sheet and produces executable, internally consistent suggestions', () => {
    expect(workbook.SheetNames).toHaveLength(8)

    for (const sheetName of workbook.SheetNames) {
      const { schema, rows } = parseWorkbookSheet(workbook, sheetName)
      const profiles = schema.columns.map((column) => profileColumn(column, rows))
      const suggestions = generateSuggestions({
        tableId: `fixture-${sheetName.toLowerCase()}`,
        tableName: sheetName,
        schema,
        profile: { columns: profiles, rowCount: rows.length },
        tableVersionHash: `fixture-${sheetName}`,
        existingDerivedTables: [],
      })
      const columnIds = new Set(schema.columns.map((column) => column.id))
      const ids = suggestions.map((suggestion) => suggestion.id)

      expect(rows.length, `${sheetName} rows`).toBeGreaterThan(0)
      expect(schema.columns.length, `${sheetName} columns`).toBeGreaterThan(0)
      expect(suggestions.length, `${sheetName} suggestions`).toBeGreaterThan(0)
      expect(new Set(ids).size, `${sheetName} duplicate suggestion IDs`).toBe(ids.length)

      for (const suggestion of suggestions) {
        for (const columnId of referencedColumnIds(suggestion)) {
          expect(columnIds.has(columnId), `${sheetName}: ${suggestion.title} references ${columnId}`).toBe(true)
        }
        if (suggestion.action.kind === 'launchRecipe') {
          expect(RECIPE_CONFIGS[suggestion.action.recipeId], `${sheetName}: missing recipe config`).toBeDefined()
          for (const [binding, value] of Object.entries(suggestion.action.initialBindings ?? {})) {
            if (binding.endsWith('ColumnId') && typeof value === 'string') {
              expect(columnIds.has(value), `${sheetName}: recipe binding ${binding} references ${value}`).toBe(true)
            }
          }
        }
        expect(suggestion.title.trim()).not.toBe('')
        expect(suggestion.impact?.summary.trim()).not.toBe('')
      }

      console.info(JSON.stringify({
        sheet: sheetName,
        dimensions: `${rows.length}x${schema.columns.length}`,
        types: schema.columns.map((column) => `${column.name}:${column.type}`),
        suggestions: suggestions.map((suggestion) => ({
          category: suggestion.category,
          title: suggestion.title,
          action: suggestion.action.kind,
        })),
      }))
    }
  })
})
