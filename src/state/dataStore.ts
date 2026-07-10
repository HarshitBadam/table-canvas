import { create } from 'zustand'
import { CellValue } from '@/types'

export interface TableRow {
  __rowId: string
  [columnId: string]: CellValue
}

interface TableData {
  rows: TableRow[]
}

interface DataStoreState {
  tableData: Record<string, TableData>

  setTableData: (tableId: string, rows: TableRow[]) => void
  clearTableData: (tableId: string) => void
}

export const useDataStore = create<DataStoreState>((set) => ({
  tableData: {},

  setTableData: (tableId, rows) =>
    set((state) => ({
      tableData: { ...state.tableData, [tableId]: { rows } },
    })),

  clearTableData: (tableId) => {
    set((state) => {
      const rest = { ...state.tableData }
      delete rest[tableId]
      return { tableData: rest }
    })
  },
}))

