/**
 * Date Cleaning Rules
 * 
 * Rules for detecting and converting date-like strings.
 */

import type { SuggestionRule } from '../../engine/types'
import { createSuggestionId, getVersionHash } from '../helpers'

/**
 * Common date patterns.
 */
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,           // ISO: 2024-01-15
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,   // US: 1/15/24 or 01/15/2024
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,     // Alt: 1-15-24
  /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/,  // Jan 15, 2024
  /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/,    // 15 Jan 2024
  /^\d{4}\/\d{2}\/\d{2}$/,         // 2024/01/15
]

/**
 * Check if a value looks like a date.
 */
export function looksLikeDate(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  
  // Check against patterns
  if (DATE_PATTERNS.some(p => p.test(str))) return true
  
  // Try parsing as date
  const parsed = Date.parse(str)
  if (!isNaN(parsed)) {
    const date = new Date(parsed)
    const year = date.getFullYear()
    // Reasonable year range
    if (year >= 1900 && year <= 2100) return true
  }
  
  return false
}

/**
 * Detect date format from sample values.
 */
export function detectDateFormat(values: Array<{ value: unknown }>): string | null {
  const formats: Record<string, number> = {}
  
  for (const v of values) {
    if (v.value === null || v.value === undefined) continue
    const str = String(v.value).trim()
    
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) formats['ISO'] = (formats['ISO'] || 0) + 1
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) formats['US'] = (formats['US'] || 0) + 1
    else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)) formats['US-short'] = (formats['US-short'] || 0) + 1
    else if (/^[A-Za-z]{3}/.test(str)) formats['text'] = (formats['text'] || 0) + 1
  }
  
  // Return most common format
  let maxFormat: string | null = null
  let maxCount = 0
  for (const [format, count] of Object.entries(formats)) {
    if (count > maxCount) {
      maxCount = count
      maxFormat = format
    }
  }
  
  return maxFormat
}

/**
 * Rule: Convert string column to date type.
 */
export const convertToDateRule: SuggestionRule = {
  id: 'convert_to_date',
  category: 'cleaning',
  scope: 'column',
  
  when: (_ctx, meta) => {
    if (!meta.column || meta.column.type !== 'string') return false
    if (!meta.columnProfile?.topValues) return false
    
    const dateLikeCount = meta.columnProfile.topValues.filter(v => 
      looksLikeDate(v.value)
    ).length
    
    return dateLikeCount >= meta.columnProfile.topValues.length * 0.7
  },
  
  build: (ctx, meta) => {
    const format = detectDateFormat(meta.columnProfile?.topValues || [])
    
    return {
      id: createSuggestionId('convert_to_date', ctx.tableId, meta.column?.id),
      category: 'cleaning',
      scope: 'column',
      title: `Convert "${meta.column!.name}" to date`,
      description: `This column contains date-like strings${format ? ` (${format} format)` : ''} that can be converted to proper dates.`,
      confidence: 'high',
      context: {
        tableId: ctx.tableId,
        columnId: meta.column!.id,
        tableVersionHash: getVersionHash(ctx),
      },
      why: [
        'Values match common date patterns',
        'Date type enables time-based analysis',
        'Proper sorting and filtering by date',
      ],
      impact: {
        kind: 'derivedTable',
        summary: `Converts column to date type`,
      },
      action: {
        kind: 'createDerivedTable',
        transform: {
          type: 'calculated_column',
          sourceTableId: ctx.tableId,
          newColumnName: `${meta.column!.name}_date`,
          expression: `DATE("${meta.column!.id}")`,
        },
        tableName: `${ctx.tableName} (with dates)`,
        openAfterApply: true,
      },
    }
  },
  
  score: () => 80,
}

/**
 * All date cleaning rules.
 */
export const dateRules: SuggestionRule[] = [
  convertToDateRule,
]
