import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { loadFile } from './db'
import type { ProjectNode, TableNode, SourceTableNode } from '@/types'

/**
 * Excel sheet names: max 31 chars, no []:*?/\
 */
export function sanitizeSheetName(name: string): string {
  let sanitized = name
    .replace(/[[\]:*?/\\]/g, '_')
    .substring(0, 31)

  if (!sanitized.trim()) {
    sanitized = 'Sheet'
  }

  return sanitized
}

export function makeSheetNamesUnique(names: string[]): string[] {
  const counts: Record<string, number> = {}
  const result: string[] = []

  for (const name of names) {
    const baseName = sanitizeSheetName(name)
    if (counts[baseName] === undefined) {
      counts[baseName] = 0
      result.push(baseName)
    } else {
      counts[baseName]++
      const suffix = ` (${counts[baseName]})`
      const truncatedBase = baseName.substring(0, 31 - suffix.length)
      result.push(truncatedBase + suffix)
    }
  }

  return result
}

export function getTableNodes(nodes: Record<string, ProjectNode>): TableNode[] {
  return Object.values(nodes)
    .filter((node): node is TableNode =>
      node.kind === 'source_table' || node.kind === 'derived_table'
    )
    .sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
}

function parseCSVForExport(fileData: ArrayBuffer): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const decoder = new TextDecoder('utf-8')
    const text = decoder.decode(fileData)

    Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        console.log(`[Export] Parsed CSV: ${results.data.length} rows`)
        resolve(results.data)
      },
      error: (err: Error) => {
        console.error('[Export] CSV parse error:', err)
        resolve([])
      },
    })
  })
}

function parseExcelForExport(fileData: ArrayBuffer, sheetName?: string): Record<string, unknown>[] {
  try {
    const wb = XLSX.read(fileData, { type: 'array' })
    const targetSheet = sheetName || wb.SheetNames[0]
    const sheet = wb.Sheets[targetSheet]

    if (!sheet) {
      console.warn(`[Export] Sheet not found: ${targetSheet}`)
      return []
    }

    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
    console.log(`[Export] Parsed Excel sheet "${targetSheet}": ${data.length} rows`)
    return data
  } catch (error) {
    console.error('[Export] Excel parse error:', error)
    return []
  }
}

/**
 * Loads and parses source table data directly from IndexedDB,
 * bypassing the materialization system for more reliable export.
 */
export async function loadSourceTableData(table: SourceTableNode): Promise<Record<string, unknown>[]> {
  const { fileRef, fileType, sheetName } = table.plan

  if (!fileRef) {
    console.warn(`[Export] Source table ${table.name} has no fileRef`)
    return []
  }

  const fileData = await loadFile(fileRef)
  if (!fileData) {
    console.warn(`[Export] File not found in IndexedDB for ${table.name}: ${fileRef}`)
    return []
  }

  console.log(`[Export] Loaded file for ${table.name}: ${fileData.byteLength} bytes`)

  if (fileType === 'csv') {
    return parseCSVForExport(fileData)
  } else if (fileType === 'xlsx') {
    return parseExcelForExport(fileData, sheetName)
  }

  return []
}
