import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { 
  ProjectNode, 
  Edge, 
  TableNode, 
  SourceTableNode, 
  DerivedTableNode,
  ChartNode,
  ChartConfig,
  TransformDef,
  Position,
  TableSchema,
  Patches,
  CellValue,
  NodeViewMode,
  CacheInfo,
  ViewFilterConfig,
} from '@/lib/types'
import { generateId } from '@/lib/utils'
import { getAllDescendants, wouldCreateCycle } from '@/engine/dependencyGraph'

// ============================================================================
// Undo/Redo History
// ============================================================================

interface HistoryEntry {
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  description: string
}

interface HistoryState {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

// ============================================================================
// Store State Interface
// ============================================================================

interface ProjectStoreState {
  // Project metadata
  projectId: string
  projectName: string
  
  // Core data
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  
  // Edit patches for source tables
  patches: Record<string, Patches>
  
  // UI state
  selectedNodeId: string | null
  selectedEdgeId: string | null
  
  // History for undo/redo
  history: HistoryState
  
  // Actions - Nodes
  addNode: (node: ProjectNode) => void
  updateNode: (id: string, updates: Partial<ProjectNode>) => void
  deleteNode: (id: string) => void
  selectNode: (id: string | null) => void
  updateNodePosition: (id: string, position: Position) => void
  updateNodeUI: (id: string, updates: { expanded?: boolean; collapsed?: boolean; viewMode?: NodeViewMode }) => void
  
  // Actions - New table creation
  addNewTable: () => void
  addSourceTable: (params: {
    name: string
    fileRef: string
    fileName: string
    fileType: 'csv' | 'xlsx'
    sheetName?: string
    schema: TableSchema
    position?: Position
  }) => string
  addDerivedTable: (params: {
    name: string
    transformDef: TransformDef
    upstreamNodeIds: string[]
    schema?: TableSchema
    position?: Position
  }) => string
  
  // Actions - Edges
  addEdge: (edge: Omit<Edge, 'id'>) => void
  deleteEdge: (id: string) => void
  selectEdge: (id: string | null) => void
  
  // Actions - Patches (editing)
  setCellValue: (tableId: string, rowId: string, columnId: string, value: CellValue) => void
  deleteRow: (tableId: string, rowId: string) => void
  insertRow: (tableId: string, rowId: string, values: Record<string, CellValue>, index: number) => void
  getPatches: (tableId: string) => Patches | undefined
  
  // Actions - Cell Highlighting
  toggleCellHighlight: (tableId: string, rowId: string, columnId: string) => void
  clearHighlights: (tableId: string) => void
  setHighlights: (tableId: string, cells: string[]) => void
  isCellHighlighted: (tableId: string, rowId: string, columnId: string) => boolean
  
  // Actions - Schema updates
  updateTableSchema: (tableId: string, schema: TableSchema) => void
  addColumn: (tableId: string, columnName: string, columnType?: 'string' | 'number' | 'boolean' | 'date') => void
  insertColumnAt: (tableId: string, columnName: string, columnType: 'string' | 'number' | 'boolean' | 'date', index: number, formula?: string) => void
  addFormulaColumn: (tableId: string, columnName: string, formula: string, columnType: 'string' | 'number' | 'boolean' | 'date', index?: number) => void
  renameColumn: (tableId: string, columnId: string, newName: string) => void
  
  // Actions - Charts
  updateChartConfig: (chartId: string, updates: Partial<ChartConfig>) => void
  updateChartName: (chartId: string, name: string) => void
  
  // Actions - View Filters (persistent filters per table)
  setTableFilters: (tableId: string, filters: ViewFilterConfig | null) => void
  getTableFilters: (tableId: string) => ViewFilterConfig | undefined
  
  // Actions - History
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  saveSnapshot: (description: string) => void
  
  // Actions - Dependency Graph & Dirty State
  markNodeDirty: (nodeId: string) => void
  markNodeAndDescendantsDirty: (nodeId: string) => void
  updateCacheInfo: (nodeId: string, cacheInfo: Partial<CacheInfo>) => void
  clearNodeError: (nodeId: string) => void
  wouldCreateCycle: (sourceId: string, targetId: string) => boolean
  
  // Selectors
  getNode: (id: string) => ProjectNode | undefined
  getTableNode: (id: string) => TableNode | undefined
  getUpstreamNodes: (nodeId: string) => ProjectNode[]
  getDownstreamNodes: (nodeId: string) => ProjectNode[]
}

// ============================================================================
// Initial State
// ============================================================================

const createInitialPatches = (): Patches => ({
  cellPatches: {},
  deletedRows: new Set(),
  insertedRows: [],
  highlightedCells: new Set(),
})

// ============================================================================
// Store Implementation
// ============================================================================

export const useProjectStore = create<ProjectStoreState>()(
  immer((set, get) => ({
    // Initial state
    projectId: generateId(),
    projectName: 'Untitled Project',
    nodes: {},
    edges: {},
    patches: {},
    selectedNodeId: null,
    selectedEdgeId: null,
    history: {
      past: [],
      future: [],
    },
    
    // ========================================================================
    // Node Actions
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
    
    selectNode: (id) => {
      set((state) => {
        state.selectedNodeId = id
        state.selectedEdgeId = null
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
    // Edge Actions
    // ========================================================================
    
    addEdge: (edge) => {
      const id = generateId()
      set((state) => {
        state.edges[id] = { ...edge, id }
      })
    },
    
    deleteEdge: (id) => {
      set((state) => {
        delete state.edges[id]
        if (state.selectedEdgeId === id) {
          state.selectedEdgeId = null
        }
      })
    },
    
    selectEdge: (id) => {
      set((state) => {
        state.selectedEdgeId = id
        state.selectedNodeId = null
      })
    },
    
    // ========================================================================
    // Patch Actions (Cell Editing)
    // ========================================================================
    
    setCellValue: (tableId, rowId, columnId, value) => {
      set((state) => {
        if (!state.patches[tableId]) {
          state.patches[tableId] = createInitialPatches()
        }
        
        const patches = state.patches[tableId]
        if (!patches.cellPatches[columnId]) {
          patches.cellPatches[columnId] = {}
        }
        patches.cellPatches[columnId][rowId] = value
        
        // Mark the node as updated
        const node = state.nodes[tableId]
        if (node) {
          node.updatedAt = new Date().toISOString()
        }
      })
      
      // Mark all downstream nodes as dirty (outside of set to avoid nesting)
      get().markNodeAndDescendantsDirty(tableId)
    },
    
    deleteRow: (tableId, rowId) => {
      set((state) => {
        if (!state.patches[tableId]) {
          state.patches[tableId] = createInitialPatches()
        }
        
        state.patches[tableId].deletedRows.add(rowId)
        
        // Update node
        const node = state.nodes[tableId]
        if (node) {
          node.updatedAt = new Date().toISOString()
        }
      })
      
      // Mark all downstream nodes as dirty (outside of set to avoid nesting)
      get().markNodeAndDescendantsDirty(tableId)
    },
    
    insertRow: (tableId, rowId, values, index) => {
      set((state) => {
        if (!state.patches[tableId]) {
          state.patches[tableId] = createInitialPatches()
        }
        
        state.patches[tableId].insertedRows.push({
          rowId,
          values,
          insertedAt: index,
        })
        
        // Update node
        const node = state.nodes[tableId]
        if (node) {
          node.updatedAt = new Date().toISOString()
        }
      })
      
      // Mark all downstream nodes as dirty (outside of set to avoid nesting)
      get().markNodeAndDescendantsDirty(tableId)
    },
    
    getPatches: (tableId) => {
      return get().patches[tableId]
    },
    
    // ========================================================================
    // Cell Highlighting
    // ========================================================================
    
    toggleCellHighlight: (tableId, rowId, columnId) => {
      set((state) => {
        if (!state.patches[tableId]) {
          state.patches[tableId] = createInitialPatches()
        }
        
        const patches = state.patches[tableId]
        if (!patches.highlightedCells) {
          patches.highlightedCells = new Set()
        }
        
        const cellKey = `${rowId}:${columnId}`
        if (patches.highlightedCells.has(cellKey)) {
          patches.highlightedCells.delete(cellKey)
        } else {
          patches.highlightedCells.add(cellKey)
        }
      })
    },
    
    clearHighlights: (tableId) => {
      set((state) => {
        if (state.patches[tableId]) {
          state.patches[tableId].highlightedCells = new Set()
        }
      })
    },
    
    setHighlights: (tableId, cells) => {
      set((state) => {
        if (!state.patches[tableId]) {
          state.patches[tableId] = createInitialPatches()
        }
        state.patches[tableId].highlightedCells = new Set(cells)
      })
    },
    
    isCellHighlighted: (tableId, rowId, columnId) => {
      const patches = get().patches[tableId]
      if (!patches?.highlightedCells) return false
      return patches.highlightedCells.has(`${rowId}:${columnId}`)
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
            // Add formula support
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
    
    wouldCreateCycle: (sourceId, targetId) => {
      const state = get()
      return wouldCreateCycle(state.edges, sourceId, targetId)
    },
    
    // ========================================================================
    // History (Undo/Redo)
    // ========================================================================
    
    saveSnapshot: (description) => {
      set((state) => {
        const snapshot: HistoryEntry = {
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges)),
          patches: JSON.parse(JSON.stringify(state.patches, (_, v) => 
            v instanceof Set ? [...v] : v
          )),
          description,
        }
        
        state.history.past.push(snapshot)
        state.history.future = [] // Clear redo stack on new action
        
        // Limit history size
        if (state.history.past.length > 50) {
          state.history.past.shift()
        }
      })
    },
    
    undo: () => {
      const state = get()
      if (state.history.past.length === 0) return
      
      set((state) => {
        const current: HistoryEntry = {
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges)),
          patches: JSON.parse(JSON.stringify(state.patches, (_, v) => 
            v instanceof Set ? [...v] : v
          )),
          description: 'Current state',
        }
        
        state.history.future.push(current)
        
        const previous = state.history.past.pop()!
        state.nodes = previous.nodes
        state.edges = previous.edges
        
        // Restore patches with Set conversion
        state.patches = {}
        Object.entries(previous.patches).forEach(([tableId, patches]) => {
          state.patches[tableId] = {
            cellPatches: (patches as Patches).cellPatches,
            deletedRows: new Set((patches as unknown as { deletedRows: string[] }).deletedRows || []),
            insertedRows: (patches as Patches).insertedRows,
            highlightedCells: new Set((patches as unknown as { highlightedCells: string[] }).highlightedCells || []),
          }
        })
      })
    },
    
    redo: () => {
      const state = get()
      if (state.history.future.length === 0) return
      
      set((state) => {
        const current: HistoryEntry = {
          nodes: JSON.parse(JSON.stringify(state.nodes)),
          edges: JSON.parse(JSON.stringify(state.edges)),
          patches: JSON.parse(JSON.stringify(state.patches, (_, v) => 
            v instanceof Set ? [...v] : v
          )),
          description: 'Current state',
        }
        
        state.history.past.push(current)
        
        const next = state.history.future.pop()!
        state.nodes = next.nodes
        state.edges = next.edges
        
        // Restore patches with Set conversion
        state.patches = {}
        Object.entries(next.patches).forEach(([tableId, patches]) => {
          state.patches[tableId] = {
            cellPatches: (patches as Patches).cellPatches,
            deletedRows: new Set((patches as unknown as { deletedRows: string[] }).deletedRows || []),
            insertedRows: (patches as Patches).insertedRows,
            highlightedCells: new Set((patches as unknown as { highlightedCells: string[] }).highlightedCells || []),
          }
        })
      })
    },
    
    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,
    
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
  }))
)

// Export a hook to check if can undo/redo
export const useCanUndo = () => useProjectStore((state) => state.history.past.length > 0)
export const useCanRedo = () => useProjectStore((state) => state.history.future.length > 0)

