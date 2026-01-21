/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Format a number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format a date to a human readable string
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a date to a relative time string
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(d)
}

/**
 * Clamp a number between min and max
 */
export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max)
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Check if a value is a valid number (not NaN, not Infinity)
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

/**
 * Parse a value to a number, returning null if invalid
 */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return isValidNumber(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/,/g, ''))
    return isValidNumber(parsed) ? parsed : null
  }
  return null
}

/**
 * Try to parse a value as a date
 */
export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  }
  return null
}

/**
 * Check if a string looks like a date format (ISO, US, or common formats)
 */
function looksLikeDate(value: string): boolean {
  // ISO format: 2024-01-01, 2024-01-01T12:00:00
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/.test(value)) return true
  // US format: 01/15/2024, 1/15/2024
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value)) return true
  // Month name format: Jan 15, 2024 or January 15, 2024
  if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$/.test(value)) return true
  // Day month year: 15 Jan 2024
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$/.test(value)) return true
  return false
}

/**
 * Check if a string is a pure number (no trailing chars)
 */
function isStrictNumber(value: string): boolean {
  const trimmed = value.trim().replace(/,/g, '')
  // Must be a valid number format: optional sign, digits, optional decimal
  return /^-?\d+(\.\d+)?$/.test(trimmed)
}

/**
 * Infer the type of a value
 */
export function inferValueType(value: unknown): 'string' | 'number' | 'boolean' | 'date' | 'null' | 'unknown' {
  if (value === null || value === undefined || value === '') return 'null'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return isValidNumber(value) ? 'number' : 'unknown'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    
    // Try boolean first (quick check)
    const lower = trimmed.toLowerCase()
    if (lower === 'true' || lower === 'false') return 'boolean'
    
    // Check for date BEFORE number (since "2024-01-01" would parse as 2024)
    if (looksLikeDate(trimmed)) {
      const date = parseDate(trimmed)
      if (date !== null) return 'date'
    }
    
    // Try strict number (must be fully numeric, no trailing chars)
    if (isStrictNumber(trimmed)) {
      const num = parseNumber(trimmed)
      if (num !== null) return 'number'
    }
    
    return 'string'
  }
  return 'unknown'
}

/**
 * Truncate a string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + '…'
}

/**
 * Create a hash of a string (simple djb2 hash)
 */
export function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

/**
 * Deep clone an object (uses structuredClone if available)
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj)
  }
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Check if two arrays are equal (shallow comparison)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Group an array by a key
 */
export function groupBy<T, K extends string | number>(
  arr: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<K, T[]>)
}

/**
 * Create a download from a blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Read a file as ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Read a file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

