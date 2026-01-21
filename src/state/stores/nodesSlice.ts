/**
 * Nodes Slice
 * 
 * Manages node CRUD operations, schema updates, and dirty state propagation.
 */

import type { StateCreator } from 'zustand'
import type { ProjectStoreState, NodesSliceState } from './types'
import type { 
  SourceTableNode, 
  DerivedTableNode, 
  ChartNode,
  TableNode,
  Position,
  TransformDef,
} from '@/types'
import { generateId } from '@/lib/utils'
import { getAllDescendants } from '@/engine/dependencyGraph'
import { createInitialPatches } from './patchesSlice'

export const createNodesSlice: StateCreator<
  ProjectStoreState,
  [['zustand/immer', never]],
  [],
  NodesSliceState
> = (set, get) => ({
  nodes: {},

  // ========================================================================
  // Basic Node Actions
  // ========================================================================

  addNode: (node) => {
    set((state) => {
      state.nodes[node.id] = node
    })
  },

  updateNode: (id, updates) => {
    set((state) => {
      const node = state.nodes[id]
      if (node) {
        Object.assign(node, updates, { updatedAt: new Date().toISOString() })
      }
    })
  },

  deleteNode: (id) => {
    const state = get()
    state.saveSnapshot(`Delete node ${state.nodes[id]?.name || id}`)

    set((state) => {
      // Delete the node
      delete state.nodes[id]

      // Delete related edges
      Object.keys(state.edges).forEach((edgeId) => {
        const edge = state.edges[edgeId]
        if (edge.fromNodeId === id || edge.toNodeId === id) {
          delete state.edges[edgeId]
        }
      })

      // Delete patches if source table
      delete state.patches[id]

      // Clear selection if this was selected
      if (state.selectedNodeId === id) {
        state.selectedNodeId = null
      }
    })
  },

  updateNodePosition: (id, position) => {
    set((state) => {
      const node = state.nodes[id]
      if (node) {
        node.ui.position = position
      }
    })
  },

  updateNodeUI: (id, updates) => {
    set((state) => {
      const node = state.nodes[id]
      if (node) {
        Object.assign(node.ui, updates)
      }
    })
  },

  // ========================================================================
  // Table Creation Actions
  // ========================================================================

  addNewTable: () => {
    const state = get()
    state.saveSnapshot('Add new table')

    const id = generateId()
    const now = new Date().toISOString()

    // Find a good position for the new table
    const existingNodes = Object.values(state.nodes)
    const maxX = existingNodes.reduce((max, n) => Math.max(max, n.ui.position.x), 0)

    const newTable: SourceTableNode = {
      id,
      kind: 'source_table',
      name: `Table ${Object.keys(state.nodes).length + 1}`,
      ui: {
        position: { x: maxX + 300, y: 100 },
      },
      schema: {
        columns: [
          { id: 'col1', name: 'Column 1', type: 'string', nullable: true },
        ],
        rowCount: 0,
      },
      plan: {
        fileRef: '',
        fileName: '',
        fileType: 'csv',
        inferredSchemaVersion: 1,
      },
      cacheInfo: {},
      createdAt: now,
      updatedAt: now,
    }

    set((state) => {
      state.nodes[id] = newTable
      state.patches[id] = createInitialPatches()
      state.selectedNodeId = id
    })
  },

  addSourceTable: ({ name, fileRef, fileName, fileType, sheetName, schema, position }) => {
    const state = get()
    state.saveSnapshot(`Import table ${name}`)

    const id = generateId()
    const now = new Date().toISOString()

    // Calculate position if not provided
    const existingNodes = Object.values(state.nodes)
    const defaultPosition = {
      x: existingNodes.length > 0
        ? Math.max(...existingNodes.map(n => n.ui.position.x)) + 300
        : 100,
      y: 100,
    }

    const newTable: SourceTableNode = {
      id,
      kind: 'source_table',
      name,
      ui: {
        position: position || defaultPosition,
      },
      schema,
      plan: {
        fileRef,
        fileName,
        fileType,
        sheetName,
        inferredSchemaVersion: 1,
      },
      cacheInfo: {},
      createdAt: now,
      updatedAt: now,
    }

    set((state) => {
      state.nodes[id] = newTable
      state.patches[id] = createInitialPatches()
      state.selectedNodeId = id
    })

    return id
  },

  addDerivedTable: ({ name, transformDef, upstreamNodeIds, schema, position }) => {
    const state = get()
    state.saveSnapshot(`Create derived table ${name}`)

    const id = generateId()
    const now = new Date().toISOString()

    // Calculate position based on upstream nodes
    const upstreamPositions = upstreamNodeIds
      .map(uid => state.nodes[uid]?.ui.position)
      .filter(Boolean) as Position[]

    const avgX = upstreamPositions.length > 0
      ? upstreamPositions.reduce((sum, p) => sum + p.x, 0) / upstreamPositions.length + 300
      : 400
    const avgY = upstreamPositions.length > 0
      ? upstreamPositions.reduce((sum, p) => sum + p.y, 0) / upstreamPositions.length
      : 100

    const newTable: DerivedTableNode = {
      id,
      kind: 'derived_table',
      name,
      ui: {
        position: position || { x: avgX, y: avgY },
      },
      schema,
      plan: {
        transformDef,
        upstreamNodeIds,
      },
      cacheInfo: { isDirty: true },
      createdAt: now,
      updatedAt: now,
    }

    set((state) => {
      state.nodes[id] = newTable

      // Create edges from upstream nodes
      upstreamNodeIds.forEach((fromId) => {
        const edgeId = generateId()
        state.edges[edgeId] = {
          id: edgeId,
          fromNodeId: fromId,
          toNodeId: id,
          transformType: transformDef.type,
        }
      })

      state.selectedNodeId = id
    })

    return id
  },

  // ========================================================================
  // Schema Updates
  // ========================================================================

  updateTableSchema: (tableId, schema) => {
    set((state) => {
      const node = state.nodes[tableId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        (node as TableNode).schema = schema
        node.updatedAt = new Date().toISOString()
      }
    })

    // Mark all downstream nodes as dirty
    get().markNodeAndDescendantsDirty(tableId)
  },

  addColumn: (tableId, columnName, columnType = 'string') => {
    set((state) => {
      const node = state.nodes[tableId]
      if (node && node.kind === 'source_table') {
        const tableNode = node as SourceTableNode
        if (!tableNode.schema) {
          tableNode.schema = { columns: [], rowCount: 0 }
        }

        // Generate a unique column ID
        const colIndex = tableNode.schema.columns.length
        const columnId = `col_${colIndex}_${columnName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`

        // Add the new column
        tableNode.schema.columns.push({
          id: columnId,
          name: columnName,
          type: columnType,
          nullable: true,
        })

        tableNode.updatedAt = new Date().toISOString()

        // Initialize cell values for existing inserted rows
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

    // Mark all downstream nodes as dirty
    get().markNodeAndDescendantsDirty(tableId)
  },

  insertColumnAt: (tableId, columnName, columnType, index, formula) => {
    set((state) => {
      const node = state.nodes[tableId]
      if (node && node.kind === 'source_table') {
        const tableNode = node as SourceTableNode
        if (!tableNode.schema) {
          tableNode.schema = { columns: [], rowCount: 0 }
        }

        // Generate a unique column ID
        const totalCols = tableNode.schema.columns.length
        const columnId = `col_${totalCols}_${columnName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`

        // Insert the new column at the specified index
        const newColumn = {
          id: columnId,
          name: columnName,
          type: columnType,
          nullable: true,
          formula: formula || undefined,
          isComputed: !!formula,
        }

        // Clamp index to valid range
        const insertIndex = Math.max(0, Math.min(index, tableNode.schema.columns.length))
        tableNode.schema.columns.splice(insertIndex, 0, newColumn)

        tableNode.updatedAt = new Date().toISOString()

        // Initialize cell values for existing inserted rows (only if not a formula column)
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

    // Mark all downstream nodes as dirty
    get().markNodeAndDescendantsDirty(tableId)
  },

  addFormulaColumn: (tableId, columnName, formula, columnType, index) => {
    set((state) => {
      const node = state.nodes[tableId]
      if (node && node.kind === 'source_table') {
        const tableNode = node as SourceTableNode
        if (!tableNode.schema) {
          tableNode.schema = { columns: [], rowCount: 0 }
        }

        // Generate a unique column ID
        const totalCols = tableNode.schema.columns.length
        const columnId = `formula_${totalCols}_${columnName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`

        // Create the formula column
        const newColumn = {
          id: columnId,
          name: columnName,
          type: columnType,
          nullable: true,
          formula: formula,
          isComputed: true,
        }

        // Insert at specified index or at end
        if (index !== undefined) {
          const insertIndex = Math.max(0, Math.min(index, tableNode.schema.columns.length))
          tableNode.schema.columns.splice(insertIndex, 0, newColumn)
        } else {
          tableNode.schema.columns.push(newColumn)
        }

        tableNode.updatedAt = new Date().toISOString()
      }
    })

    // Mark all downstream nodes as dirty
    get().markNodeAndDescendantsDirty(tableId)
  },

  renameColumn: (tableId, columnId, newName) => {
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

    // Mark all downstream nodes as dirty (column renames affect derived tables)
    get().markNodeAndDescendantsDirty(tableId)
  },

  // ========================================================================
  // View Filters (Persistent Filters per Table)
  // ========================================================================

  setTableFilters: (tableId, filters) => {
    set((state) => {
      const node = state.nodes[tableId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        const tableNode = node as TableNode
        // Store filters on the node - null or empty conditions means no filters
        if (filters && filters.conditions.length > 0) {
          tableNode.viewFilters = filters
        } else {
          // Clear filters if empty
          tableNode.viewFilters = undefined
        }
        tableNode.updatedAt = new Date().toISOString()
      }
    })
  },

  getTableFilters: (tableId) => {
    const node = get().nodes[tableId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return (node as TableNode).viewFilters
    }
    return undefined
  },

  // ========================================================================
  // Chart Actions
  // ========================================================================

  updateChartConfig: (chartId, updates) => {
    set((state) => {
      const node = state.nodes[chartId]
      if (node && node.kind === 'chart') {
        const chartNode = node as ChartNode
        chartNode.plan.config = {
          ...chartNode.plan.config,
          ...updates,
        }
        chartNode.updatedAt = new Date().toISOString()
      }
    })
  },

  updateChartName: (chartId, name) => {
    set((state) => {
      const node = state.nodes[chartId]
      if (node && node.kind === 'chart') {
        node.name = name
        node.updatedAt = new Date().toISOString()
      }
    })
  },

  // ========================================================================
  // Dependency Graph & Dirty State
  // ========================================================================

  markNodeDirty: (nodeId) => {
    set((state) => {
      const node = state.nodes[nodeId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        const tableNode = node as TableNode
        if (!tableNode.cacheInfo) {
          tableNode.cacheInfo = {}
        }
        tableNode.cacheInfo.isDirty = true
        tableNode.cacheInfo.error = undefined // Clear previous error
        tableNode.updatedAt = new Date().toISOString()
      }
    })
  },

  markNodeAndDescendantsDirty: (nodeId) => {
    const state = get()

    // Mark the node itself as dirty
    state.markNodeDirty(nodeId)

    // Get all descendants and mark them dirty too
    const descendants = getAllDescendants(nodeId, state.edges)

    set((draft) => {
      for (const descendantId of descendants) {
        const node = draft.nodes[descendantId]
        if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
          const tableNode = node as TableNode
          if (!tableNode.cacheInfo) {
            tableNode.cacheInfo = {}
          }
          tableNode.cacheInfo.isDirty = true
          tableNode.cacheInfo.error = undefined // Clear previous error
          tableNode.updatedAt = new Date().toISOString()
        }
      }
    })
  },

  updateCacheInfo: (nodeId, cacheInfoUpdates) => {
    set((state) => {
      const node = state.nodes[nodeId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        const tableNode = node as TableNode
        if (!tableNode.cacheInfo) {
          tableNode.cacheInfo = {}
        }
        Object.assign(tableNode.cacheInfo, cacheInfoUpdates)
        tableNode.updatedAt = new Date().toISOString()
      }
    })
  },

  clearNodeError: (nodeId) => {
    set((state) => {
      const node = state.nodes[nodeId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        const tableNode = node as TableNode
        if (tableNode.cacheInfo) {
          tableNode.cacheInfo.error = undefined
        }
      }
    })
  },

  // ========================================================================
  // Selectors
  // ========================================================================

  getNode: (id) => get().nodes[id],

  getTableNode: (id) => {
    const node = get().nodes[id]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      return node as TableNode
    }
    return undefined
  },

  getUpstreamNodes: (nodeId) => {
    const state = get()
    const upstreamIds = Object.values(state.edges)
      .filter(e => e.toNodeId === nodeId)
      .map(e => e.fromNodeId)

    return upstreamIds.map(id => state.nodes[id]).filter(Boolean)
  },

  getDownstreamNodes: (nodeId) => {
    const state = get()
    const downstreamIds = Object.values(state.edges)
      .filter(e => e.fromNodeId === nodeId)
      .map(e => e.toNodeId)

    return downstreamIds.map(id => state.nodes[id]).filter(Boolean)
  },
})
