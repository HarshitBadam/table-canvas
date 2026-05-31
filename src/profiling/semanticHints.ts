import type { CellValue, SemanticHint } from '@/types'

const PATTERNS = {
  currency: /^\$?[\d,]+\.?\d*$/,
  percentage: /^\d+\.?\d*%$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/[^\s]+$/,
  phone: /^[\d\-+()s]+$/,
  zipcode: /^\d{5}(-\d{4})?$/,
  date: /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/,
}

export function detectSemanticHints(
  columnName: string,
  values: CellValue[],
  type: string
): SemanticHint[] {
  const hints: SemanticHint[] = []
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
  
  if (nonNullValues.length === 0) return hints

  const sampleSize = Math.min(100, nonNullValues.length)
  const sample = nonNullValues.slice(0, sampleSize).map(v => String(v))

  const lowerName = columnName.toLowerCase()
  
  // ID detection - match: ends with _id, starts with id_, is exactly "id", or contains "key"/"code" as word
  const isIdColumn = 
    lowerName === 'id' ||
    lowerName.endsWith('_id') ||
    lowerName.endsWith('id') && lowerName.length <= 12 ||
    lowerName.startsWith('id_') ||
    /\b(key|code)\b/.test(lowerName)
  
  if (isIdColumn) {
    hints.push('id')
  }
  
  if (lowerName.includes('email')) {
    hints.push('email')
  }
  
  if (lowerName.includes('url') || lowerName.includes('link') || lowerName.includes('website')) {
    hints.push('url')
  }
  
  if (lowerName.includes('phone') || lowerName.includes('tel') || lowerName.includes('mobile')) {
    hints.push('phone')
  }
  
  if (lowerName.includes('zip') || lowerName.includes('postal')) {
    hints.push('zipcode')
  }
  
  if (lowerName.includes('country')) {
    hints.push('country')
  }
  
  if (lowerName.includes('category') || lowerName.includes('type') || lowerName.includes('status')) {
    hints.push('category')
  }

  if (type === 'string') {
    const currencyMatches = sample.filter(v => PATTERNS.currency.test(v)).length
    if (currencyMatches / sampleSize > 0.8) {
      hints.push('currency')
    }

    const percentMatches = sample.filter(v => PATTERNS.percentage.test(v)).length
    if (percentMatches / sampleSize > 0.8) {
      hints.push('percentage')
    }

    const emailMatches = sample.filter(v => PATTERNS.email.test(v)).length
    if (emailMatches / sampleSize > 0.8 && !hints.includes('email')) {
      hints.push('email')
    }

    const urlMatches = sample.filter(v => PATTERNS.url.test(v)).length
    if (urlMatches / sampleSize > 0.8 && !hints.includes('url')) {
      hints.push('url')
    }
  }

  const uniqueValues = new Set(sample)
  const uniqueRatio = uniqueValues.size / sampleSize

  if (uniqueRatio < 0.1 && uniqueValues.size <= 20 && !hints.includes('category')) {
    hints.push('category')
  }

  return hints
}
