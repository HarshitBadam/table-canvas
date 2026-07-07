import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import ReactFlow, {
  Controls,
  Node,
  Edge,
  Connection,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Panel,
  NodeMouseHandler,
  NodeDragHandler,
  ConnectionLineType,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useProjectStore } from '@/state/projectStore'
import { useApp } from '@/state/AppContext'
import { useProfilingStore, loadProfileForTable } from '@/profiling/profiler'
import type { NodeViewMode, ProjectNode, Edge as ProjectEdge } from '@/lib/types'
import { wouldCreateCycle } from '@/engine/dependencyGraph'
import { TableNodeComponent } from './nodes/TableNode'
import { ChartNodeComponent } from './nodes/ChartNode'
import { ImportButton } from '@/components/ImportButton'
import { computeSmartEdges, SmartEdge } from './edgeRouter'
import { CustomConnectionLine } from './ConnectionLine'
import { getLayoutedNodes, LayoutDirection } from './autoLayout'
import { NewTableModal } from './modals/NewTableModal'

// Lazy loaded modals for code splitting
const TransformModal = lazy(() => import('./modals/TransformModal').then(m => ({ default: m.TransformModal })))

// Define custom node types
const nodeTypes: NodeTypes = {
  tableNode: TableNodeComponent,
  chartNode: ChartNodeComponent,
}


interface CanvasViewProps {
  onNodeDoubleClick: (nodeId: string) => void
}

export function CanvasView({ onNodeDoubleClick: onNodeDoubleClickProp }: CanvasViewProps) {
  const projectNodes = useProjectStore((state) => state.nodes)
  const projectEdges = useProjectStore((state) => state.edges)
  const patches = useProjectStore((state) => state.patches)
  const updateNodePosition = useProjectStore((state) => state.updateNodePosition)
  const updateNodeUI = useProjectStore((state) => state.updateNodeUI)
  const selectNode = useProjectStore((state) => state.selectNode)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  
  // Get profiling data for all tables
  const profiles = useProfilingStore((state) => state.profiles)
  const profilesLoading = useProfilingStore((state) => state.loading)
  
  // Modal state for creating transforms
  const [transformModalOpen, setTransformModalOpen] = useState(false)
  const [pendingConnection, setPendingConnection] = useState<{
    source: string
    target: string
  } | null>(null)
  
  // Modal state for creating new tables
  const [newTableModalOpen, setNewTableModalOpen] = useState(false)
  
  // Cycle warning toast state
  const [cycleWarning, setCycleWarning] = useState<string | null>(null)
  
  // Throttle ref for drag updates
  const lastDragUpdate = useRef(0)
  const DRAG_THROTTLE_MS = 16 // ~60fps

  // Helper to get current view mode from UI state
  const getViewMode = useCallback((ui: { expanded?: boolean; viewMode?: NodeViewMode }): NodeViewMode => {
    if (ui?.viewMode) {
      // Handle legacy 'stats' mode - map to 'collapsed'
      if ((ui.viewMode as string) === 'stats') return 'collapsed'
      return ui.viewMode
    }
    // Legacy: expanded maps to data now (stats removed)
    if (ui?.expanded) return 'data'
    return 'collapsed'
  }, [])

  // Helper to get next view mode in cycle (only 2 modes now)
  const getNextViewMode = useCallback((current: NodeViewMode): NodeViewMode => {
    switch (current) {
      case 'collapsed': return 'data'
      case 'data': return 'collapsed'
      default: return 'collapsed'
    }
  }, [])

  // Callback to set a specific view mode
  const handleSetViewMode = useCallback((nodeId: string, mode: NodeViewMode) => {
    const node = projectNodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      updateNodeUI(nodeId, { viewMode: mode, expanded: mode === 'data' })
    }
  }, [projectNodes, updateNodeUI])

  // Callback to cycle through view modes (collapsed -> stats -> data -> collapsed)
  const handleCycleViewMode = useCallback((nodeId: string) => {
    const node = projectNodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      const currentMode = getViewMode(node.ui)
      const nextMode = getNextViewMode(currentMode)
      handleSetViewMode(nodeId, nextMode)
    }
  }, [projectNodes, getViewMode, getNextViewMode, handleSetViewMode])

  // Legacy callback to toggle node expansion (for backward compatibility)
  const handleToggleExpanded = useCallback((nodeId: string) => {
    const node = projectNodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      const willExpand = !node.ui.expanded
      updateNodeUI(nodeId, { expanded: willExpand })
      
      // Trigger profile loading when expanding
      if (willExpand) {
        loadProfileForTable(nodeId)
      }
    }
  }, [projectNodes, updateNodeUI])

  // Convert project nodes to React Flow nodes
  const initialNodes: Node[] = useMemo(() => {
    return (Object.values(projectNodes) as ProjectNode[]).map((node) => ({
      id: node.id,
      type: node.kind === 'chart' ? 'chartNode' : 'tableNode',
      position: node.ui.position,
      data: {
        ...node,
        selected: node.id === selectedNodeId,
        // Add profile data for table nodes
        profile: (node.kind === 'source_table' || node.kind === 'derived_table') 
          ? profiles[node.id] 
          : undefined,
        profileLoading: (node.kind === 'source_table' || node.kind === 'derived_table')
          ? profilesLoading[node.id]
          : false,
        // Add patches data for data view mode
        patches: (node.kind === 'source_table' || node.kind === 'derived_table')
          ? patches[node.id]
          : undefined,
        onToggleExpanded: handleToggleExpanded,
        onCycleViewMode: handleCycleViewMode,
        onSetViewMode: handleSetViewMode,
      },
      selected: node.id === selectedNodeId,
    }))
  }, [projectNodes, selectedNodeId, profiles, profilesLoading, patches, handleToggleExpanded, handleCycleViewMode, handleSetViewMode])

  // Base edges without handle computation (for reuse during drag)
  const baseEdges: Edge[] = useMemo(() => {
    return (Object.values(projectEdges) as ProjectEdge[]).map((edge) => ({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      type: 'smoothstep',
      animated: false,
      label: edge.transformType,
      // pathOptions controls the smoothstep routing
      pathOptions: {
        offset: 25, // Smaller offset for tighter, cleaner paths
        borderRadius: 10, // Smooth rounded corners
      },
      // Ensure edges render below nodes
      zIndex: 0,
      style: {
        strokeWidth: 2.5,
        stroke: '#3d6b52',
      },
      labelStyle: { 
        fontSize: 10, 
        fontWeight: 600,
        fill: 'var(--color-text-secondary)',
        letterSpacing: '0.02em',
      },
      labelBgStyle: {
        fill: 'var(--color-surface)',
        fillOpacity: 0.95,
        rx: 4,
        ry: 4,
      },
      labelBgPadding: [8, 5] as [number, number],
    }))
  }, [projectEdges])

  // Convert project edges to React Flow edges with smart handle selection
  const initialEdges: SmartEdge[] = useMemo(() => {
    const rfNodes: Node[] = (Object.values(projectNodes) as ProjectNode[]).map((node) => ({
      id: node.id,
      type: node.kind === 'chart' ? 'chartNode' : 'tableNode',
      position: node.ui.position,
      data: node,
    }))
    return computeSmartEdges(rfNodes, baseEdges)
  }, [baseEdges, projectNodes])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync nodes when project nodes change
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  // Sync edges when project edges change
  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  // Handle real-time edge updates during node drag (throttled)
  const onNodeDrag: NodeDragHandler = useCallback(
    (_, node) => {
      const now = Date.now()
      if (now - lastDragUpdate.current < DRAG_THROTTLE_MS) return
      lastDragUpdate.current = now
      
      // Update edges in real-time with new node position
      setNodes(currentNodes => {
        const updatedNodes = currentNodes.map(n =>
          n.id === node.id ? { ...n, position: node.position } : n
        )
        // Recompute edges with updated positions
        const smartEdges = computeSmartEdges(updatedNodes, baseEdges)
        setEdges(smartEdges)
        return updatedNodes
      })
    },
    [baseEdges, setNodes, setEdges]
  )

  // Handle node position changes - persist to store
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      updateNodePosition(node.id, node.position)
    },
    [updateNodePosition]
  )

  // Handle node selection - charts open on single click
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id)
      
      // Charts open on single click
      const projectNode = projectNodes[node.id]
      if (projectNode?.kind === 'chart') {
        onNodeDoubleClickProp(node.id)
      }
    },
    [selectNode, projectNodes, onNodeDoubleClickProp]
  )

  // Handle node double click to open grid (tables only now, charts use single click)
  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const projectNode = projectNodes[node.id]
      // Only trigger for tables, charts already handled by single click
      if (projectNode?.kind !== 'chart') {
        onNodeDoubleClickProp(node.id)
      }
    },
    [onNodeDoubleClickProp, projectNodes]
  )

  // Handle new connections - opens transform modal
  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) {
      // Check for cycles before allowing the connection
      if (wouldCreateCycle(projectEdges, connection.source, connection.target)) {
        // Show warning and block the connection
        const sourceName = projectNodes[connection.source]?.name || 'Source'
        const targetName = projectNodes[connection.target]?.name || 'Target'
        setCycleWarning(
          `Cannot connect "${sourceName}" to "${targetName}": This would create a circular dependency.`
        )
        
        // Auto-dismiss after 4 seconds
        setTimeout(() => setCycleWarning(null), 4000)
        return
      }
      
      setPendingConnection({
        source: connection.source,
        target: connection.target,
      })
      setTransformModalOpen(true)
    }
  }, [projectEdges, projectNodes])

  // Handle pane click to deselect
  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  // Get delete function from AppContext
  const { deleteNodeWithSync } = useApp()

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.isContentEditable

      // Delete/Backspace: Delete selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
        if (selectedNodeId) {
          e.preventDefault()
          deleteNodeWithSync(selectedNodeId)
        }
      }

      // Undo: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, selectedNodeId, deleteNodeWithSync])

  // Auto-arrange nodes using dagre layout
  const handleAutoArrange = useCallback((direction: LayoutDirection = 'LR') => {
    if (nodes.length === 0) return
    
    // Get layouted positions
    const layoutedNodes = getLayoutedNodes(nodes, edges, { direction })
    
    // Update all node positions in the store
    layoutedNodes.forEach((node) => {
      updateNodePosition(node.id, node.position)
    })
    
    // Update local state
    setNodes(layoutedNodes)
    
    // Recompute edges with new positions
    const smartEdges = computeSmartEdges(layoutedNodes, baseEdges)
    setEdges(smartEdges)
  }, [nodes, edges, baseEdges, updateNodePosition, setNodes, setEdges])

  // Handle transform modal close
  const handleTransformModalClose = () => {
    setTransformModalOpen(false)
    setPendingConnection(null)
  }

  return (
    <div className="h-full w-full relative">
      {/* Static grid background */}
      <div className="absolute inset-0 canvas-grid" />
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: {
            strokeWidth: 2.5,
            stroke: '#3d6b52',
          },
        }}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineComponent={CustomConnectionLine}
        snapToGrid
        snapGrid={[20, 20]}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        {/* Auto-Arrange Panel */}
        {Object.keys(projectNodes).length > 1 && (
          <Panel position="bottom-left" className="ml-3 mb-3">
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg shadow-md p-1">
              <button
                onClick={() => handleAutoArrange('LR')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-accent-green hover:bg-surface-secondary rounded-md transition-colors"
                title="Auto-arrange nodes"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Auto-Arrange
              </button>
              <div className="w-px h-5 bg-border" />
              {/* Down arrow = Vertical/Top-to-Bottom layout */}
              <button
                onClick={() => handleAutoArrange('TB')}
                className="p-1.5 text-text-tertiary hover:text-accent-green hover:bg-surface-secondary rounded-md transition-colors"
                title="Arrange vertically (top to bottom)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-6-6m6 6l6-6" />
                </svg>
              </button>
              {/* Right arrow = Horizontal/Left-to-Right layout */}
              <button
                onClick={() => handleAutoArrange('LR')}
                className="p-1.5 text-text-tertiary hover:text-accent-green hover:bg-surface-secondary rounded-md transition-colors"
                title="Arrange horizontally (left to right)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16m0 0l-6-6m6 6l-6 6" />
                </svg>
              </button>
            </div>
          </Panel>
        )}
        
        {/* Zoom Controls - above auto-arrange */}
        <Controls 
          showInteractive={false}
          position="bottom-left"
          style={{ marginLeft: 12, marginBottom: 60 }}
          className="!bg-surface !border !border-border !rounded-lg !shadow-md [&>button]:!bg-surface [&>button]:!border-0 [&>button]:!text-text-secondary [&>button:hover]:!bg-surface-secondary"
        />
        
        {/* Empty state */}
        {Object.keys(projectNodes).length === 0 && (
          <Panel position="top-center" className="mt-16">
            <div className="text-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-green-200/50 dark:border-green-800/30 p-12 max-w-lg relative overflow-hidden">
              {/* Decorative gradient orbs */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-green-400/20 to-emerald-500/20 rounded-full blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-gradient-to-tr from-emerald-400/20 to-green-500/20 rounded-full blur-3xl" />
              
              <div className="relative">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
                  <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-text-primary mb-3">
                  Welcome to Table Canvas
                </h2>
                <p className="text-sm text-text-secondary mb-8 max-w-sm mx-auto leading-relaxed">
                  Create powerful data workflows by importing files, transforming data, and building visualizations.
                </p>
                <div className="flex gap-4 justify-center">
                  <div className="w-40">
                    <ImportButton />
                  </div>
                  <button 
                    className="btn btn-secondary px-6 shadow-sm"
                    onClick={() => setNewTableModalOpen(true)}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Table
                  </button>
                </div>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Transform Modal - Lazy Loaded */}
      {transformModalOpen && pendingConnection && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center"><div className="bg-surface rounded-lg p-8 animate-pulse">Loading...</div></div>}>
          <TransformModal
            isOpen={transformModalOpen}
            onClose={handleTransformModalClose}
            sourceNodeId={pendingConnection.source}
            targetNodeId={pendingConnection.target}
          />
        </Suspense>
      )}
      
      {/* New Table Modal */}
      {newTableModalOpen && (
        <NewTableModal
          isOpen={newTableModalOpen}
          onClose={() => setNewTableModalOpen(false)}
        />
      )}
      
      {/* Cycle Warning Toast */}
      {cycleWarning && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/90 border border-amber-200 dark:border-amber-700 rounded-xl shadow-lg max-w-md">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Circular Dependency Blocked
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                {cycleWarning}
              </p>
            </div>
            <button
              onClick={() => setCycleWarning(null)}
              className="flex-shrink-0 p-1 text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
