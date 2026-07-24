import type { CellValue, ColumnSchema } from '@/types'
import type { GridRow } from './types'
import { validateCellInput } from './cellValueValidation'

interface GridPasteChange {
  rowId: string
  columnId: string
  value: CellValue
}

export interface GridPastePlan {
  changes: GridPasteChange[]
  invalidCount: number
  readOnlyCount: number
  outOfBoundsCount: number
}

export function parseTabularClipboard(text: string): string[][] {
  if (!text) return []

  const rows: string[][] = [[]]
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index++) {
    const character = text[index]

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"'
        index++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === '\t' && !inQuotes) {
      rows.at(-1)!.push(field)
      field = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      rows.at(-1)!.push(field)
      rows.push([])
      field = ''
      if (character === '\r' && text[index + 1] === '\n') index++
      continue
    }

    field += character
  }

  rows.at(-1)!.push(field)

  if (
    rows.length > 1
    && rows.at(-1)!.length === 1
    && rows.at(-1)![0] === ''
    && /[\r\n]$/.test(text)
  ) {
    rows.pop()
  }

  if (rows[0]?.[0]?.startsWith('\uFEFF')) {
    rows[0][0] = rows[0][0].slice(1)
  }

  return rows
}

interface CreateGridPastePlanOptions {
  text: string
  startRow: number
  startColIndex: number
  rows: GridRow[]
  columns: ColumnSchema[]
}

export function createGridPastePlan({
  text,
  startRow,
  startColIndex,
  rows,
  columns,
}: CreateGridPastePlanOptions): GridPastePlan {
  const matrix = parseTabularClipboard(text)
  const plan: GridPastePlan = {
    changes: [],
    invalidCount: 0,
    readOnlyCount: 0,
    outOfBoundsCount: 0,
  }

  matrix.forEach((clipboardRow, rowOffset) => {
    clipboardRow.forEach((input, columnOffset) => {
      const row = rows[startRow + rowOffset]
      const column = columns[startColIndex + columnOffset]

      if (!row || !column) {
        plan.outOfBoundsCount++
        return
      }

      if (column.isComputed) {
        plan.readOnlyCount++
        return
      }

      const validation = validateCellInput(input, column.type)
      if (!validation.valid) {
        plan.invalidCount++
        return
      }

      plan.changes.push({
        rowId: row.__rowId,
        columnId: column.id,
        value: validation.parsedValue,
      })
    })
  })

  return plan
}

export function describePasteSkips(plan: GridPastePlan): string {
  const reasons: string[] = []
  if (plan.invalidCount) reasons.push(`${plan.invalidCount} invalid`)
  if (plan.readOnlyCount) reasons.push(`${plan.readOnlyCount} read-only`)
  if (plan.outOfBoundsCount) reasons.push(`${plan.outOfBoundsCount} outside the table`)
  return reasons.join(', ')
}
