import type { CellValue } from '@/types'
import type { GridRow } from './types'
import { ENUM_THRESHOLD, isEmptyFilterValue } from './filterOperators'

type GetDisplayValue = (rowId: string, columnId: string, base: CellValue, row?: GridRow) => CellValue

export function getUniqueValues(rows: GridRow[], columnId: string, getDisplayValue: GetDisplayValue, limit = 100): CellValue[] {
  const seen = new Set<string>()
  const values: CellValue[] = []
  for (const row of rows) {
    if (values.length >= limit) break
    const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
    const key = String(value)
    if (!seen.has(key) && !isEmptyFilterValue(value)) {
      seen.add(key)
      values.push(value)
    }
  }
  return values.sort((left, right) =>
    typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right)),
  )
}

export function countUniqueValues(rows: GridRow[], columnId: string, getDisplayValue: GetDisplayValue, maxCheck = ENUM_THRESHOLD + 1): number {
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.size > maxCheck) break
    const value = getDisplayValue(row.__rowId, columnId, row[columnId], row)
    if (!isEmptyFilterValue(value)) seen.add(String(value).toLowerCase())
  }
  return seen.size
}
