import type { StateCreator } from 'zustand'
import type { ProjectStoreState, NodesSliceState } from './types'
import type { SourceTableNode, UserColumnType } from '@/types'

type SetFn = Parameters<StateCreator<ProjectStoreState, [['zustand/immer', never]], [], NodesSliceState>>[0]
type GetFn = Parameters<StateCreator<ProjectStoreState, [['zustand/immer', never]], [], NodesSliceState>>[1]

export function createColumnOps(set: SetFn, get: GetFn) {
  return {
    addColumn: (tableId: string, columnName: string, columnType: UserColumnType = 'string') => {
      set((state) => {
        const node = state.nodes[tableId]
        if (node && node.kind === 'source_table') {
          const tableNode = node as SourceTableNode
          if (!tableNode.schema) {
            tableNode.schema = { columns: [], rowCount: 0 }
          }

          const colIndex = tableNode.schema.columns.length
          const columnId = `col_${colIndex}_${columnName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`

          tableNode.schema.columns.push({
            id: columnId,
            name: columnName,
            type: columnType,
            nullable: true,
          })

          tableNode.updatedAt = new Date().toISOString()

          const patches = state.patches[tableId]
          if (patches?.insertedRows) {
            patches.insertedRows.forEach(row => {
              if (row.values[columnId] === undefined) {
                row.values[columnId] = ''
              }
            })
          }
        }
      })

      get().markNodeAndDescendantsDirty(tableId)
    },

    insertColumnAt: (tableId: string, columnName: string, columnType: UserColumnType, index: number, formula?: string) => {
      set((state) => {
        const node = state.nodes[tableId]
        if (node && node.kind === 'source_table') {
          const tableNode = node as SourceTableNode
          if (!tableNode.schema) {
            tableNode.schema = { columns: [], rowCount: 0 }
          }

          const totalCols = tableNode.schema.columns.length
          const columnId = `col_${totalCols}_${columnName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`

          const newColumn = {
            id: columnId,
            name: columnName,
            type: columnType,
            nullable: true,
            formula: formula || undefined,
            isComputed: !!formula,
          }

          const insertIndex = Math.max(0, Math.min(index, tableNode.schema.columns.length))
          tableNode.schema.columns.splice(insertIndex, 0, newColumn)

          tableNode.updatedAt = new Date().toISOString()

          if (!formula) {
            const patches = state.patches[tableId]
            if (patches?.insertedRows) {
              patches.insertedRows.forEach(row => {
                if (row.values[columnId] === undefined) {
                  row.values[columnId] = ''
                }
              })
            }
          }
        }
      })

      get().markNodeAndDescendantsDirty(tableId)
    },

    addFormulaColumn: (tableId: string, columnName: string, formula: string, columnType: UserColumnType, index?: number) => {
      set((state) => {
        const node = state.nodes[tableId]
        if (node && node.kind === 'source_table') {
          const tableNode = node as SourceTableNode
          if (!tableNode.schema) {
            tableNode.schema = { columns: [], rowCount: 0 }
          }

          const totalCols = tableNode.schema.columns.length
          const columnId = `formula_${totalCols}_${columnName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`

          const newColumn = {
            id: columnId,
            name: columnName,
            type: columnType,
            nullable: true,
            formula: formula,
            isComputed: true,
          }

          if (index !== undefined) {
            const insertIndex = Math.max(0, Math.min(index, tableNode.schema.columns.length))
            tableNode.schema.columns.splice(insertIndex, 0, newColumn)
          } else {
            tableNode.schema.columns.push(newColumn)
          }

          tableNode.updatedAt = new Date().toISOString()
        }
      })

      get().markNodeAndDescendantsDirty(tableId)
    },

    renameColumn: (tableId: string, columnId: string, newName: string) => {
      set((state) => {
        const node = state.nodes[tableId]
        if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
          const tableNode = node as SourceTableNode
          if (tableNode.schema) {
            const column = tableNode.schema.columns.find(c => c.id === columnId)
            if (column) {
              column.name = newName
              tableNode.updatedAt = new Date().toISOString()
            }
          }
        }
      })

      get().markNodeAndDescendantsDirty(tableId)
    },
  }
}
