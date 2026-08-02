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
import { computeSchemaFingerprint } from '@/engine/cacheUtils'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import { canWriteDocument } from '@/state/transientProjectState'
import { createInitialPatches } from './patchesSlice'
import { createColumnOps } from './nodesColumnOps'
import { createChartOps } from './nodesChartOps'
import { applyNodeDuplicate, prepareNodeDuplicate } from './duplicateNode'
import { invalidateMaterializations } from '@/engine/materializationCoordinator'
import { applyNodeUpdate, isTableRename, markRenameDependentsDirty } from './nodesRename'
import { cancelTableOperation } from '@/state/tableOperationCoordinator'

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
    const current = get().nodes[id]
    const renamingTable = isTableRename(current, updates)
    set((state) => {
      applyNodeUpdate(state, id, updates)
    })
    if (renamingTable) markRenameDependentsDirty(get(), id)
  },
  duplicateNode: (id, options) => {
    const state = get()
    const sourceNode = state.nodes[id]
    if (!sourceNode) return undefined

    const duplicate = prepareNodeDuplicate(state, id)
    if (!duplicate) return undefined
    const selectedNodeId = state.selectedNodeId
    state.saveSnapshot(`Duplicate node ${sourceNode.name}`)
    set((draft) => {
      applyNodeDuplicate(draft, duplicate)
      if (options?.selectDuplicate === false) {
        draft.selectedNodeId = selectedNodeId
      }
    })
    return duplicate.id
  },

  deleteNode: (id, options) => {
    const state = get()
    if (!state.nodes[id]) return
    if (options?.recordHistory !== false) {
      state.saveSnapshot(`Delete node ${state.nodes[id].name}`)
    }
    const nodeIds = new Set([id, ...getDependentNodeIds(state.nodes, state.edges, id)])
    invalidateMaterializations()
    nodeIds.forEach(cancelTableOperation)
    useTableRuntimeStore.getState().forgetNodes(nodeIds)

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
    const current = get().nodes[id]
    if (!current || Object.entries(updates).every(([key, value]) =>
      current.ui[key as keyof typeof updates] === value
    )) return
    get().saveSnapshot(`Change view for ${current.name}`)
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
    select = true,
    recordHistory = true,
  }) => {
    const state = get()
    if (recordHistory) state.saveSnapshot(`Import table ${name}`)
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
      createdAt: now,
      updatedAt: now,
    }

    set((state) => {
      state.nodes[id] = newTable
      state.patches[id] = createInitialPatches()
      if (select) state.selectedNodeId = id
    })

    return id
  },

  addDerivedTable: ({
    name,
    transformDef,
    upstreamNodeIds,
    schema,
    position,
    recordHistory = true,
  }) => {
    const state = get()
    if (recordHistory) state.saveSnapshot(`Create derived table ${name}`)
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
      createdAt: now,
      updatedAt: now,
    }

    useTableRuntimeStore.getState().markNodesDirty([id])
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
    useTableRuntimeStore.getState().setMaterializedSchema(tableId, schema)
    const node = get().getTableNode(tableId)
    if (!node) return
    const isUnchanged = computeSchemaFingerprint(node.schema)
      === computeSchemaFingerprint(schema)
    // Persisting an identical schema would dirty the document from a viewing tab.
    if (isUnchanged || !canWriteDocument()) return
    set((state) => {
      const target = state.nodes[tableId]
      if (target && (target.kind === 'source_table' || target.kind === 'derived_table')) {
        (target as TableNode).schema = schema
      }
    })
  },
  ...createColumnOps(set, get),
  setTableFilters: (tableId, filters) => {
    const current = get().getTableNode(tableId)
    if (!current) return
    const next = filters && filters.conditions.length > 0 ? filters : undefined
    if (JSON.stringify(current.viewFilters) === JSON.stringify(next)) return
    get().saveSnapshot(`Change filters for ${current.name}`)
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
    const current = get().nodes[chartId]
    if (!current || current.kind !== 'chart') return
    const nextConfig = { ...current.plan.config, ...updates }
    if (JSON.stringify(current.plan.config) === JSON.stringify(nextConfig)) return
    get().saveSnapshot(`Update chart ${current.name}`)
    set((state) => {
      const node = state.nodes[chartId]
      if (node && node.kind === 'chart') {
        const chartNode = node as ChartNode
        chartNode.plan.config = nextConfig
        chartNode.updatedAt = new Date().toISOString()
      }
    })
  },

  updateChartName: (chartId, name) => {
    const current = get().nodes[chartId]
    if (!current || current.kind !== 'chart' || current.name === name) return
    get().saveSnapshot(`Rename chart ${current.name}`)
    set((state) => {
      const node = state.nodes[chartId]
      if (node && node.kind === 'chart') {
        node.name = name
        node.updatedAt = new Date().toISOString()
      }
    })
  },

  markNodeAndDescendantsDirty: (nodeId) => {
    const state = get()
    const affected = [nodeId, ...getDependentNodeIds(state.nodes, state.edges, nodeId)]
      .filter((id) => {
        const node = state.nodes[id]
        return node?.kind === 'source_table' || node?.kind === 'derived_table'
      })
    useTableRuntimeStore.getState().markNodesDirty(affected)
  },

  /**
   * The only arbiter the cross-device three-way merge has for this node and its cell
   * patches, so every real data edit has to call it. Positions and view modes
   * deliberately do not: the merge resolves those subtrees without a timestamp.
   */
  touchNodeUpdatedAt: (nodeId) => {
    set((state) => {
      const node = state.nodes[nodeId]
      if (node) node.updatedAt = new Date().toISOString()
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
