import type { StateCreator } from 'zustand'
import type { ProjectStoreState, NodesSliceState } from './types'
import type { 
  SourceTableNode, 
  DerivedTableNode, 
  ChartNode,
  TableNode,
  Position,
} from '@/types'
import { generateId } from '@/lib/utils'
import { getDependentNodeIds } from '@/engine/workflowGraph'
import { createInitialPatches } from './patchesSlice'
import { createColumnOps } from './nodesColumnOps'
import { createChartOps } from './nodesChartOps'
import { applyNodeDuplicate, prepareNodeDuplicate } from './duplicateNode'
import { invalidateMaterializations } from '@/engine/materializationCoordinator'

export const createNodesSlice: StateCreator<
  ProjectStoreState,
  [['zustand/immer', never]],
  [],
  NodesSliceState
> = (set, get) => ({
  nodes: {},

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

  duplicateNode: (id) => {
    const state = get()
    const sourceNode = state.nodes[id]
    if (!sourceNode) return undefined

    const duplicate = prepareNodeDuplicate(state, id)
    if (!duplicate) return undefined
    state.saveSnapshot(`Duplicate node ${sourceNode.name}`)
    set(draft => applyNodeDuplicate(draft, duplicate))
    return duplicate.id
  },

  deleteNode: (id) => {
    const state = get()
    state.saveSnapshot(`Delete node ${state.nodes[id]?.name || id}`)
    const nodeIds = new Set([id, ...getDependentNodeIds(state.nodes, state.edges, id)])
    invalidateMaterializations()

    set((state) => {
      for (const nodeId of nodeIds) {
        delete state.nodes[nodeId]
        delete state.patches[nodeId]
      }

      Object.keys(state.edges).forEach((edgeId) => {
        const edge = state.edges[edgeId]
        if (nodeIds.has(edge.fromNodeId) || nodeIds.has(edge.toNodeId)) {
          delete state.edges[edgeId]
        }
      })

      if (state.selectedNodeId && nodeIds.has(state.selectedNodeId)) {
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

  addNewTable: () => {
    const state = get()
    state.saveSnapshot('Add new table')

    const id = generateId()
    const now = new Date().toISOString()

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

  addSourceTable: ({
    name,
    fileRef,
    fileName,
    fileType,
    sheetName,
    schema,
    position,
    initialRows,
  }) => {
    const state = get()
    state.saveSnapshot(`Import table ${name}`)

    const id = generateId()
    const now = new Date().toISOString()

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
        initialRows,
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

  ...createChartOps(set, get),
  updateTableSchema: (tableId, schema) => {
    set((state) => {
      const node = state.nodes[tableId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        (node as TableNode).schema = schema
        node.updatedAt = new Date().toISOString()
      }
    })
    get().markNodeAndDescendantsDirty(tableId)
  },
  setMaterializedTableSchema: (tableId, schema) => {
    set((state) => {
      const node = state.nodes[tableId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        (node as TableNode).schema = schema
      }
    })
  },
  ...createColumnOps(set, get),
  setTableFilters: (tableId, filters) => {
    set((state) => {
      const node = state.nodes[tableId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        const tableNode = node as TableNode
        if (filters && filters.conditions.length > 0) {
          tableNode.viewFilters = filters
        } else {
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

  markNodeDirty: (nodeId) => {
    set((state) => {
      const node = state.nodes[nodeId]
      if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
        const tableNode = node as TableNode
        if (!tableNode.cacheInfo) {
          tableNode.cacheInfo = {}
        }
        tableNode.cacheInfo.isDirty = true
        tableNode.cacheInfo.error = undefined
        tableNode.cacheInfo.dataRevision = (tableNode.cacheInfo.dataRevision ?? 0) + 1
        tableNode.updatedAt = new Date().toISOString()
      }
    })
  },

  markNodeAndDescendantsDirty: (nodeId) => {
    const state = get()
    state.markNodeDirty(nodeId)
    const descendants = getDependentNodeIds(state.nodes, state.edges, nodeId)
    set((draft) => {
      for (const descendantId of descendants) {
        const node = draft.nodes[descendantId]
        if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
          const tableNode = node as TableNode
          if (!tableNode.cacheInfo) {
            tableNode.cacheInfo = {}
          }
          tableNode.cacheInfo.isDirty = true
          tableNode.cacheInfo.error = undefined
          tableNode.cacheInfo.dataRevision = (tableNode.cacheInfo.dataRevision ?? 0) + 1
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
