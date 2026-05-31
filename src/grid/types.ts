import type { CellValue } from '@/types'

export type { TableRow as GridRow } from '@/state/dataStore'

export interface ContextMenuState {
  x: number
  y: number
  type: 'cell' | 'row' | 'column' | 'header' | 'index' | 'corner'
  rowIndex?: number
  columnId?: string
}

export type SelectionType =
  | { type: 'cell'; rowIndex: number; columnId: string }
  | { type: 'row'; rowIndex: number }
  | { type: 'column'; columnId: string }
  | { type: 'header-row' }
  | { type: 'index-column' }
  | { type: 'corner' }
  | null

export interface GridClipboardData {
  headers: string[]
  columnIds: string[]
  rows: CellValue[][]
  sourceTableId: string
  sourceTableName: string
  timestamp: number
}

declare global {
  interface Window {
    __gridClipboard?: GridClipboardData
  }
}
