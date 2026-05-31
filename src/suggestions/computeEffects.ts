import type { Suggestion, CellValue, CleaningOperation } from '@/types'
import type { TableRow } from '@/state/dataStore'
import { isPlaceholder } from './cleaningConstants'

interface CellChange {
  rowId: string
  columnId: string
  oldValue: CellValue
  newValue: CellValue
}

type OperationType = 'fix' | 'review'

interface SuggestionEffect {
  changes: CellChange[]
  highlights: string[] // "rowId:columnId" format
  operationType: OperationType
}

function applyCleaningOperation(value: CellValue, operation: CleaningOperation): CellValue {
  if (value === null || value === undefined) {
    // For fill_missing operations, we handle nulls separately
    return value
  }

  const strValue = String(value)

  switch (operation.type) {
    case 'trim':
      return strValue.trim()
    
    case 'replace_typos':
    case 'normalize_case':
      return operation.mappings[strValue] ?? value
    
    case 'nullify_placeholders':
      if (isPlaceholder(value)) {
        return null
      }
      return value
    
    case 'fill_missing_string':
      return value
    
    case 'fill_missing_numeric':
      return value // mean fill for null values is handled in the caller
    
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
  meanValue?: number
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
      // Skip actual null/undefined - only convert placeholder STRINGS
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
      if (operation.strategy === 'mean' && meanValue !== undefined) {
        newValue = Math.round(meanValue * 100) / 100
      } else if (operation.strategy === 'median') {
        newValue = meanValue ?? 0
      } else if (operation.strategy === 'zero') {
        newValue = 0
      } else {
        newValue = oldValue
      }
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
