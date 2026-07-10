import type { Suggestion, CellValue, CleaningOperation } from '@/types'
import type { TableRow } from '@/state/dataStore'
import { isPlaceholder } from './cleaningConstants'

export interface CellChange {
  rowId: string
  columnId: string
  oldValue: CellValue
  newValue: CellValue
}

type OperationType = 'fix' | 'review'

export interface SuggestionEffect {
  changes: CellChange[]
  highlights: string[]
  operationType: OperationType
}

function applyCleaningOperation(value: CellValue, operation: CleaningOperation): CellValue {
  if (value === null || value === undefined) {
    return value
  }

  const strValue = String(value)

  switch (operation.type) {
    case 'trim':
      return strValue.trim()

    case 'lowercase':
      return strValue.toLowerCase()

    case 'uppercase':
      return strValue.toUpperCase()

    case 'titlecase':
      return strValue.replace(/\w\S*/g, (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
      )
    
    case 'replace_typos':
    case 'normalize_case': {
      const exactMatch = operation.mappings[strValue]
      if (exactMatch !== undefined) return exactMatch
      const normalizedValue = strValue.trim().toLowerCase()
      const normalizedMatch = Object.entries(operation.mappings).find(
        ([candidate]) => candidate.trim().toLowerCase() === normalizedValue,
      )
      return normalizedMatch?.[1] ?? value
    }
    
    case 'nullify_placeholders':
      if (isPlaceholder(value)) {
        return null
      }
      return value
    
    case 'standardize_date': {
      const parsed = Date.parse(strValue)
      if (Number.isNaN(parsed)) return value
      const date = new Date(parsed)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    case 'epoch_to_date': {
      if (typeof value !== 'number') return value
      const timestamp = operation.unit === 'seconds' ? value * 1000 : value
      const date = new Date(timestamp)
      return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10)
    }

    case 'fill_missing_string':
    case 'fill_missing_numeric':
      return value
    
    case 'remove_outliers':
      if (typeof value === 'number') {
        if (value < operation.lowerBound || value > operation.upperBound) {
          return null
        }
      }
      return value
    
    default:
      return value
  }
}

function getOperationType(operation: CleaningOperation): OperationType {
  return operation.type === 'highlight_outliers' ? 'review' : 'fix'
}

export function computeSuggestionEffect(
  suggestion: Suggestion,
  rows: TableRow[],
  numericFillValue?: number
): SuggestionEffect {
  const changes: CellChange[] = []
  const highlights: string[] = []
  const operation = suggestion.context.cleaningOperation
  const columnId = suggestion.context.columnId
  const operationType = operation ? getOperationType(operation) : 'fix'

  if (!operation || !columnId) return { changes, highlights, operationType }

  if (operation.type === 'highlight_outliers') {
    for (const row of rows) {
      const value = row[columnId]
      if (typeof value === 'number') {
        if (value < operation.lowerBound || value > operation.upperBound) {
          highlights.push(`${row.__rowId}:${columnId}`)
        }
      }
    }
    return { changes, highlights, operationType }
  }

  if (operation.type === 'nullify_placeholders' && columnId) {
    for (const row of rows) {
      const oldValue = row[columnId]
      if (oldValue === null || oldValue === undefined) continue
      
      if (isPlaceholder(oldValue)) {
        changes.push({
          rowId: row.__rowId,
          columnId,
          oldValue,
          newValue: null,
        })
      }
    }
    return { changes, highlights, operationType }
  }

  for (const row of rows) {
    const oldValue = row[columnId]
    let newValue: CellValue

    if (operation.type === 'fill_missing_numeric' &&
        (oldValue === null || oldValue === undefined || oldValue === '')) {
      if ((operation.strategy === 'mean' || operation.strategy === 'median') && numericFillValue !== undefined) {
        newValue = Math.round(numericFillValue * 100) / 100
      } else if (operation.strategy === 'zero') {
        newValue = 0
      } else {
        newValue = oldValue
      }
    } else if (
      operation.type === 'fill_missing_string' &&
      (oldValue === null || oldValue === undefined || oldValue === '')
    ) {
      newValue = operation.value
    } else {
      newValue = applyCleaningOperation(oldValue, operation)
    }

    if (oldValue !== newValue) {
      changes.push({
        rowId: row.__rowId,
        columnId,
        oldValue,
        newValue,
      })
    }
  }

  return { changes, highlights, operationType }
}

function numericFillValue(
  rows: TableRow[],
  columnId: string,
  strategy: 'mean' | 'median' | 'zero',
): number | undefined {
  if (strategy === 'zero') return 0
  const values = rows
    .map(row => row[columnId])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (values.length === 0) return undefined
  if (strategy === 'mean') {
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }
  values.sort((a, b) => a - b)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle]
}

export function computeCombinedSuggestionEffect(
  suggestions: Suggestion[],
  rows: TableRow[],
): SuggestionEffect {
  const workingRows = rows.map(row => ({ ...row }))
  const rowsById = new Map(workingRows.map(row => [row.__rowId, row]))
  const changesByCell = new Map<string, CellChange>()
  const highlights = new Set<string>()

  const fixes = suggestions.filter(
    suggestion => suggestion.context.cleaningOperation?.type !== 'highlight_outliers'
      && suggestion.context.cleaningOperation?.type !== 'nullify_placeholders'
      && suggestion.context.cleaningOperation?.type !== 'remove_outliers',
  )
  const terminalFixes = suggestions.filter(
    suggestion => suggestion.context.cleaningOperation?.type === 'nullify_placeholders'
      || suggestion.context.cleaningOperation?.type === 'remove_outliers',
  )
  const reviews = suggestions.filter(
    suggestion => suggestion.context.cleaningOperation?.type === 'highlight_outliers',
  )

  for (const suggestion of [...fixes, ...terminalFixes, ...reviews]) {
    const operation = suggestion.context.cleaningOperation
    const columnId = suggestion.context.columnId
    const fillValue = operation?.type === 'fill_missing_numeric' && columnId
      ? numericFillValue(workingRows, columnId, operation.strategy)
      : undefined
    const effect = computeSuggestionEffect(suggestion, workingRows, fillValue)

    for (const highlight of effect.highlights) highlights.add(highlight)
    for (const change of effect.changes) {
      const key = `${change.rowId}:${change.columnId}`
      const existing = changesByCell.get(key)
      changesByCell.set(key, {
        ...change,
        oldValue: existing?.oldValue ?? change.oldValue,
      })
      const row = rowsById.get(change.rowId)
      if (row) row[change.columnId] = change.newValue
    }
  }

  return {
    changes: [...changesByCell.values()].filter(change => change.oldValue !== change.newValue),
    highlights: [...highlights],
    operationType: highlights.size > 0 && changesByCell.size === 0 ? 'review' : 'fix',
  }
}
