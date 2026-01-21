/**
 * useCellValidation Hook
 * 
 * Provides validation logic for cell values based on column type.
 */

import { useCallback } from 'react'
import type { CellValue } from '@/types'

interface ValidationResult {
  valid: boolean
  error: string | null
  parsedValue: CellValue
}

interface UseCellValidationReturn {
  /** Validate a value against a column type */
  validateValue: (value: string, columnType: string) => ValidationResult
}

/**
 * Hook for validating cell values.
 */
export function useCellValidation(): UseCellValidationReturn {
  const validateValue = useCallback((value: string, columnType: string): ValidationResult => {
    // Empty values are allowed (nullable)
    if (value === '' || value.trim() === '') {
      return { valid: true, error: null, parsedValue: '' }
    }

    switch (columnType) {
      case 'number': {
        // Remove commas and whitespace for number parsing
        const cleanValue = value.replace(/,/g, '').trim()
        const num = Number(cleanValue)
        if (isNaN(num)) {
          return { valid: false, error: 'Please enter a valid number', parsedValue: value }
        }
        return { valid: true, error: null, parsedValue: num }
      }

      case 'boolean': {
        const lower = value.toLowerCase().trim()
        if (['true', 'false', '1', '0', 'yes', 'no'].includes(lower)) {
          // Store as "True" or "False" string for consistent display
          const boolValue = ['true', '1', 'yes'].includes(lower) ? 'True' : 'False'
          return { valid: true, error: null, parsedValue: boolValue }
        }
        return { valid: false, error: 'Please enter true/false, yes/no, or 1/0', parsedValue: value }
      }

      case 'date': {
        // Accept various date formats
        const date = new Date(value)
        if (isNaN(date.getTime())) {
          return { valid: false, error: 'Please enter a valid date (e.g., 2024-01-15 or Jan 15, 2024)', parsedValue: value }
        }
        return { valid: true, error: null, parsedValue: value }
      }

      default:
        // String type - accept anything
        return { valid: true, error: null, parsedValue: value }
    }
  }, [])

  return { validateValue }
}
