import { create } from 'zustand'
import { CellValue } from '@/types'

export interface TableRow {
  __rowId: string
  [columnId: string]: CellValue
}

export interface TableData {
  tableId: string
  rows: TableRow[]
  loadedAt: string
  isLoading: boolean
  error?: string
}

interface DataStoreState {
  tableData: Record<string, TableData>
  
  setTableData: (tableId: string, rows: TableRow[]) => void
  setLoading: (tableId: string, isLoading: boolean) => void
  setError: (tableId: string, error: string) => void
  clearTableData: (tableId: string) => void
  
  getSlice: (tableId: string, start: number, end: number) => TableRow[]
}

export const useDataStore = create<DataStoreState>((set, get) => ({
  tableData: {},
  
  setTableData: (tableId, rows) => {
    set((state) => ({
      tableData: {
        ...state.tableData,
        [tableId]: {
          tableId,
          rows,
          loadedAt: new Date().toISOString(),
          isLoading: false,
          error: undefined,
        },
      },
    }))
  },
  
  setLoading: (tableId, isLoading) => {
    set((state) => ({
      tableData: {
        ...state.tableData,
        [tableId]: {
          ...state.tableData[tableId],
          tableId,
          rows: state.tableData[tableId]?.rows ?? [],
          loadedAt: state.tableData[tableId]?.loadedAt ?? '',
          isLoading,
        },
      },
    }))
  },
  
  setError: (tableId, error) => {
    set((state) => ({
      tableData: {
        ...state.tableData,
        [tableId]: {
          ...state.tableData[tableId],
          tableId,
          rows: state.tableData[tableId]?.rows ?? [],
          loadedAt: state.tableData[tableId]?.loadedAt ?? '',
          isLoading: false,
          error,
        },
      },
    }))
  },
  
  clearTableData: (tableId) => {
    set((state) => {
      const { [tableId]: _, ...rest } = state.tableData
      return { tableData: rest }
    })
  },
  
  getSlice: (tableId, start, end) => {
    const data = get().tableData[tableId]
    if (!data?.rows) return []
    return data.rows.slice(start, end)
  },
}))

