import type { CellValue, ColumnType } from '@/types'

export interface CellValueValidation {
  valid: boolean
  error: string | null
  parsedValue: CellValue
}

export function validateCellInput(value: string, columnType: ColumnType): CellValueValidation {
  if (value === '' || value.trim() === '') {
    return { valid: true, error: null, parsedValue: '' }
  }

  switch (columnType) {
    case 'number': {
      const cleanValue = value.replace(/,/g, '').trim()
      const numberValue = Number(cleanValue)
      if (!Number.isFinite(numberValue)) {
        return { valid: false, error: 'Enter a valid number', parsedValue: value }
      }
      return { valid: true, error: null, parsedValue: numberValue }
    }
    case 'boolean': {
      const normalized = value.toLowerCase().trim()
      if (!['true', 'false', '1', '0', 'yes', 'no'].includes(normalized)) {
        return {
          valid: false,
          error: 'Enter true/false, yes/no, or 1/0',
          parsedValue: value,
        }
      }
      return {
        valid: true,
        error: null,
        parsedValue: ['true', '1', 'yes'].includes(normalized) ? 'True' : 'False',
      }
    }
    case 'date':
    case 'datetime': {
      const normalized = value.trim()
      const date = new Date(normalized)
      if (Number.isNaN(date.getTime())) {
        return {
          valid: false,
          error: columnType === 'date' ? 'Enter a valid date' : 'Enter a valid date and time',
          parsedValue: value,
        }
      }
      return { valid: true, error: null, parsedValue: normalized }
    }
    default:
      return { valid: true, error: null, parsedValue: value }
  }
}
