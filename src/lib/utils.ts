import type { ProjectNode, TableNode } from '@/types'

export function getTableNodes(nodes: Record<string, ProjectNode>): TableNode[] {
  return Object.values(nodes)
    .filter((node): node is TableNode =>
      node.kind === 'source_table' || node.kind === 'derived_table'
    )
    .sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`
}

export function formatNumber(num: number, options?: { compact?: boolean }): string {
  if (options?.compact) {
    const abs = Math.abs(num)
    if (abs >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `${(num / 1e3).toFixed(2)}K`
    if (Number.isInteger(num)) return num.toLocaleString()
    return num.toFixed(2)
  }
  return num.toLocaleString()
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return isValidNumber(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/,/g, ''))
    return isValidNumber(parsed) ? parsed : null
  }
  return null
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  }
  return null
}

function looksLikeDate(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/.test(str)) return true
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str)) return true
  if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$/.test(str)) return true
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$/.test(str)) return true
  return false
}

function isStrictNumber(value: string): boolean {
  const trimmed = value.trim().replace(/,/g, '')
  return /^-?\d+(\.\d+)?$/.test(trimmed)
}

export function inferValueType(value: unknown): 'string' | 'number' | 'boolean' | 'date' | 'null' | 'unknown' {
  if (value === null || value === undefined || value === '') return 'null'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return isValidNumber(value) ? 'number' : 'unknown'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    
    const lower = trimmed.toLowerCase()
    if (lower === 'true' || lower === 'false') return 'boolean'
    
    if (looksLikeDate(trimmed)) {
      const date = parseDate(trimmed)
      if (date !== null) return 'date'
    }
    
    if (isStrictNumber(trimmed)) {
      const num = parseNumber(trimmed)
      if (num !== null) return 'number'
    }
    
    return 'string'
  }
  return 'unknown'
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}
