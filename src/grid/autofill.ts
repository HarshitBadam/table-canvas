/**
 * Excel-like autofill pattern detection and value generation
 */

import { CellValue } from '@/types'

// Pattern types we can detect
export type PatternType = 
  | 'number-sequence'      // 1, 2, 3 or 2, 4, 6
  | 'month-full'           // January, February, March
  | 'month-short'          // Jan, Feb, Mar
  | 'day-full'             // Monday, Tuesday, Wednesday
  | 'day-short'            // Mon, Tue, Wed
  | 'date-sequence'        // 2024-01-01, 2024-01-02
  | 'alphanumeric'         // Week 1, Week 2 or Item A, Item B
  | 'repeat'               // No pattern - repeat values cyclically

export interface DetectedPattern {
  type: PatternType
  step?: number           // For number sequences (e.g., 2 for 2,4,6)
  prefix?: string         // For alphanumeric patterns (e.g., "Week ")
  suffix?: string         // For alphanumeric patterns
  dateStep?: number       // Days to add for date sequences
  values: CellValue[]     // Original values for repeat pattern
}

// Full month names
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Short month names
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Full day names
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Short day names
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Normalize boolean values for comparison
 */
function normalizeBoolean(v: CellValue): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const lower = v.toLowerCase().trim()
    if (lower === 'true') return true
    if (lower === 'false') return false
  }
  return null
}

/**
 * Detect the pattern in a list of values
 */
export function detectPattern(values: CellValue[]): DetectedPattern {
  if (values.length === 0) {
    return { type: 'repeat', values: [] }
  }

  // Check if all values are booleans - handle as repeat pattern
  const booleans = values.map(normalizeBoolean)
  if (booleans.every(b => b !== null)) {
    // Convert to proper boolean values for repeat pattern
    const normalizedValues = booleans.map(b => b ? 'True' : 'False')
    return { type: 'repeat', values: normalizedValues }
  }

  // Try to detect number sequence
  const numberPattern = detectNumberSequence(values)
  if (numberPattern) return numberPattern

  // Try to detect month names
  const monthPattern = detectMonthPattern(values)
  if (monthPattern) return monthPattern

  // Try to detect day names
  const dayPattern = detectDayPattern(values)
  if (dayPattern) return dayPattern

  // Try to detect date sequence
  const datePattern = detectDateSequence(values)
  if (datePattern) return datePattern

  // Try to detect alphanumeric pattern (e.g., Week 1, Week 2)
  const alphanumericPattern = detectAlphanumericPattern(values)
  if (alphanumericPattern) return alphanumericPattern

  // Default: repeat the values cyclically
  return { type: 'repeat', values }
}

/**
 * Detect number sequence pattern
 */
function detectNumberSequence(values: CellValue[]): DetectedPattern | null {
  const numbers = values.map(v => {
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const parsed = parseFloat(v.replace(/,/g, ''))
      return isNaN(parsed) ? null : parsed
    }
    return null
  })

  // All values must be valid numbers
  if (numbers.some(n => n === null)) return null

  const validNumbers = numbers as number[]

  if (validNumbers.length === 1) {
    // Single number - assume increment by 1
    return { type: 'number-sequence', step: 1, values }
  }

  // Calculate the step (difference between consecutive values)
  const step = validNumbers[1] - validNumbers[0]

  // Verify the step is consistent
  for (let i = 2; i < validNumbers.length; i++) {
    const currentStep = validNumbers[i] - validNumbers[i - 1]
    if (Math.abs(currentStep - step) > 0.0001) {
      // Inconsistent step - fallback to repeat
      return null
    }
  }

  return { type: 'number-sequence', step, values }
}

/**
 * Detect month name pattern
 */
function detectMonthPattern(values: CellValue[]): DetectedPattern | null {
  const strings = values.map(v => String(v).trim())

  // Check for full month names
  const fullIndices = strings.map(s => 
    MONTHS_FULL.findIndex(m => m.toLowerCase() === s.toLowerCase())
  )
  if (fullIndices.every(i => i !== -1)) {
    return { type: 'month-full', values }
  }

  // Check for short month names
  const shortIndices = strings.map(s => 
    MONTHS_SHORT.findIndex(m => m.toLowerCase() === s.toLowerCase())
  )
  if (shortIndices.every(i => i !== -1)) {
    return { type: 'month-short', values }
  }

  return null
}

/**
 * Detect day name pattern
 */
function detectDayPattern(values: CellValue[]): DetectedPattern | null {
  const strings = values.map(v => String(v).trim())

  // Check for full day names
  const fullIndices = strings.map(s => 
    DAYS_FULL.findIndex(d => d.toLowerCase() === s.toLowerCase())
  )
  if (fullIndices.every(i => i !== -1)) {
    return { type: 'day-full', values }
  }

  // Check for short day names
  const shortIndices = strings.map(s => 
    DAYS_SHORT.findIndex(d => d.toLowerCase() === s.toLowerCase())
  )
  if (shortIndices.every(i => i !== -1)) {
    return { type: 'day-short', values }
  }

  return null
}

/**
 * Detect date sequence pattern
 */
function detectDateSequence(values: CellValue[]): DetectedPattern | null {
  const dates = values.map(v => {
    const str = String(v)
    const date = new Date(str)
    return isNaN(date.getTime()) ? null : date
  })

  if (dates.some(d => d === null)) return null

  const validDates = dates as Date[]

  if (validDates.length === 1) {
    // Single date - assume daily increment
    return { type: 'date-sequence', dateStep: 1, values }
  }

  // Calculate the step in days
  const msPerDay = 24 * 60 * 60 * 1000
  const step = Math.round((validDates[1].getTime() - validDates[0].getTime()) / msPerDay)

  // Verify consistency
  for (let i = 2; i < validDates.length; i++) {
    const currentStep = Math.round((validDates[i].getTime() - validDates[i - 1].getTime()) / msPerDay)
    if (currentStep !== step) {
      return null
    }
  }

  return { type: 'date-sequence', dateStep: step, values }
}

/**
 * Detect alphanumeric pattern like "Week 1", "Week 2" or "Item A", "Item B"
 */
function detectAlphanumericPattern(values: CellValue[]): DetectedPattern | null {
  const strings = values.map(v => String(v))

  // Try to find a common prefix with incrementing numbers
  const numericPattern = /^(.*)(\d+)(.*)$/
  const matches = strings.map(s => s.match(numericPattern))

  if (matches.every(m => m !== null)) {
    const validMatches = matches as RegExpMatchArray[]
    const prefix = validMatches[0][1]
    const suffix = validMatches[0][3]

    // Verify all have the same prefix and suffix
    if (validMatches.every(m => m[1] === prefix && m[3] === suffix)) {
      const numbers = validMatches.map(m => parseInt(m[2], 10))
      
      if (numbers.length === 1) {
        return { type: 'alphanumeric', prefix, suffix, step: 1, values }
      }

      const step = numbers[1] - numbers[0]
      
      // Verify consistent step
      for (let i = 2; i < numbers.length; i++) {
        if (numbers[i] - numbers[i - 1] !== step) {
          return null
        }
      }

      return { type: 'alphanumeric', prefix, suffix, step, values }
    }
  }

  // Try to find letter sequence (A, B, C)
  const letterPattern = /^(.*)([A-Za-z])(.*)$/
  const letterMatches = strings.map(s => s.match(letterPattern))

  if (letterMatches.every(m => m !== null)) {
    const validLetterMatches = letterMatches as RegExpMatchArray[]
    const prefix = validLetterMatches[0][1]
    const suffix = validLetterMatches[0][3]

    if (validLetterMatches.every(m => m[1] === prefix && m[3] === suffix)) {
      const letters = validLetterMatches.map(m => m[2])
      
      // Check if letters are sequential
      const codes = letters.map(l => l.charCodeAt(0))
      
      if (codes.length === 1) {
        return { type: 'alphanumeric', prefix, suffix, step: 1, values }
      }

      const step = codes[1] - codes[0]
      
      for (let i = 2; i < codes.length; i++) {
        if (codes[i] - codes[i - 1] !== step) {
          return null
        }
      }

      return { type: 'alphanumeric', prefix, suffix, step, values }
    }
  }

  return null
}

/**
 * Generate the next N values based on the detected pattern
 */
export function generateNextValues(pattern: DetectedPattern, count: number): CellValue[] {
  const result: CellValue[] = []
  const sourceValues = pattern.values

  if (sourceValues.length === 0 || count <= 0) {
    return result
  }

  switch (pattern.type) {
    case 'number-sequence': {
      const lastValue = typeof sourceValues[sourceValues.length - 1] === 'number' 
        ? sourceValues[sourceValues.length - 1] as number
        : parseFloat(String(sourceValues[sourceValues.length - 1]).replace(/,/g, ''))
      const step = pattern.step ?? 1
      
      for (let i = 0; i < count; i++) {
        result.push(lastValue + step * (i + 1))
      }
      break
    }

    case 'month-full': {
      const lastMonth = String(sourceValues[sourceValues.length - 1])
      let idx = MONTHS_FULL.findIndex(m => m.toLowerCase() === lastMonth.toLowerCase())
      
      for (let i = 0; i < count; i++) {
        idx = (idx + 1) % 12
        result.push(MONTHS_FULL[idx])
      }
      break
    }

    case 'month-short': {
      const lastMonth = String(sourceValues[sourceValues.length - 1])
      let idx = MONTHS_SHORT.findIndex(m => m.toLowerCase() === lastMonth.toLowerCase())
      
      for (let i = 0; i < count; i++) {
        idx = (idx + 1) % 12
        result.push(MONTHS_SHORT[idx])
      }
      break
    }

    case 'day-full': {
      const lastDay = String(sourceValues[sourceValues.length - 1])
      let idx = DAYS_FULL.findIndex(d => d.toLowerCase() === lastDay.toLowerCase())
      
      for (let i = 0; i < count; i++) {
        idx = (idx + 1) % 7
        result.push(DAYS_FULL[idx])
      }
      break
    }

    case 'day-short': {
      const lastDay = String(sourceValues[sourceValues.length - 1])
      let idx = DAYS_SHORT.findIndex(d => d.toLowerCase() === lastDay.toLowerCase())
      
      for (let i = 0; i < count; i++) {
        idx = (idx + 1) % 7
        result.push(DAYS_SHORT[idx])
      }
      break
    }

    case 'date-sequence': {
      const lastDateStr = String(sourceValues[sourceValues.length - 1])
      const lastDate = new Date(lastDateStr)
      const msPerDay = 24 * 60 * 60 * 1000
      const step = pattern.dateStep ?? 1
      
      for (let i = 0; i < count; i++) {
        const newDate = new Date(lastDate.getTime() + msPerDay * step * (i + 1))
        // Format as YYYY-MM-DD
        result.push(newDate.toISOString().split('T')[0])
      }
      break
    }

    case 'alphanumeric': {
      const lastStr = String(sourceValues[sourceValues.length - 1])
      const prefix = pattern.prefix ?? ''
      const suffix = pattern.suffix ?? ''
      const step = pattern.step ?? 1

      // Check if it's a number pattern
      const numMatch = lastStr.match(/^(.*)(\d+)(.*)$/)
      if (numMatch && numMatch[1] === prefix && numMatch[3] === suffix) {
        let lastNum = parseInt(numMatch[2], 10)
        for (let i = 0; i < count; i++) {
          lastNum += step
          result.push(`${prefix}${lastNum}${suffix}`)
        }
        break
      }

      // Check if it's a letter pattern
      const letterMatch = lastStr.match(/^(.*)([A-Za-z])(.*)$/)
      if (letterMatch && letterMatch[1] === prefix && letterMatch[3] === suffix) {
        let lastCode = letterMatch[2].charCodeAt(0)
        const isUpper = letterMatch[2] === letterMatch[2].toUpperCase()
        
        for (let i = 0; i < count; i++) {
          lastCode += step
          // Wrap around A-Z or a-z
          if (isUpper) {
            if (lastCode > 90) lastCode = 65 + (lastCode - 91)
            if (lastCode < 65) lastCode = 90 - (64 - lastCode)
          } else {
            if (lastCode > 122) lastCode = 97 + (lastCode - 123)
            if (lastCode < 97) lastCode = 122 - (96 - lastCode)
          }
          result.push(`${prefix}${String.fromCharCode(lastCode)}${suffix}`)
        }
        break
      }

      // Fallback to repeat
      for (let i = 0; i < count; i++) {
        result.push(sourceValues[i % sourceValues.length])
      }
      break
    }

    case 'repeat':
    default: {
      // Repeat values cyclically
      for (let i = 0; i < count; i++) {
        result.push(sourceValues[i % sourceValues.length])
      }
      break
    }
  }

  return result
}

/**
 * Get a human-readable description of the detected pattern
 */
export function getPatternDescription(pattern: DetectedPattern): string {
  switch (pattern.type) {
    case 'number-sequence':
      return pattern.step === 1 
        ? 'Number sequence (+1)' 
        : `Number sequence (step: ${pattern.step})`
    case 'month-full':
    case 'month-short':
      return 'Month sequence'
    case 'day-full':
    case 'day-short':
      return 'Day sequence'
    case 'date-sequence':
      return pattern.dateStep === 1 
        ? 'Daily dates' 
        : `Date sequence (${pattern.dateStep} days)`
    case 'alphanumeric':
      return 'Alphanumeric sequence'
    case 'repeat':
    default:
      return 'Repeat values'
  }
}

