import { useCallback, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import ReactFlow, {
  Controls,
  Node,
  Edge,
  Connection,
  useNodesState,
  useEdgesState,
  NodeTypes,
  NodeMouseHandler,
  ConnectionLineType,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useProjectStore } from '@/state/projectStore'
import { useProfilingStore } from '@/lib/profiling'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import type { ProjectNode, Edge as ProjectEdge } from '@/types'
import { useCanvasKeyboard } from './useCanvasKeyboard'
import { useCanvasViewMode } from './useCanvasViewMode'
import { wouldCreateCycle } from '@/engine/dependencyGraph'
import { TableNodeComponent } from './nodes/TableNode'
import type { ChartNodeData } from './nodes/ChartNode'
import { computeSmartEdges, SmartEdge } from './edgeRouter'
import { CustomConnectionLine } from './ConnectionLine'
import { getLayoutedNodes, LayoutDirection } from './autoLayout'
import { CanvasAutoArrangePanel, CanvasEmptyState, CycleWarningToast } from './CanvasViewPanels'
import { NewTableModal } from './modals/NewTableModal'

const TransformModal = lazy(() => import('./modals/TransformModal').then(m => ({ default: m.TransformModal })))
const LazyChartNodeComponent = lazy(() => import('./nodes/ChartNode').then(m => ({ default: m.ChartNodeComponent })))

function ChartNodeLoader(props: NodeProps<ChartNodeData>) {
  return (
    <Suspense fallback={
      <div className="flex h-44 w-[220px] items-center justify-center rounded-lg bg-surface shadow-md ring-1 ring-border">
        <LoadingSpinner size="sm" />
      </div>
    }>
      <LazyChartNodeComponent {...props} />
    </Suspense>
  )
}

const nodeTypes: NodeTypes = {
  tableNode: TableNodeComponent,
  chartNode: ChartNodeLoader,
}


interface CanvasViewProps {
  onNodeDoubleClick: (nodeId: string) => void
}

export function CanvasView({ onNodeDoubleClick: onNodeDoubleClickProp }: CanvasViewProps) {
  const projectId = useProjectStore((state) => state.projectId)
  const projectNodes = useProjectStore((state) => state.nodes)
  const projectEdges = useProjectStore((state) => state.edges)
  const patches = useProjectStore((state) => state.patches)
  const updateNodePosition = useProjectStore((state) => state.updateNodePosition)
  const selectNode = useProjectStore((state) => state.selectNode)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  
  const profiles = useProfilingStore((state) => state.profiles)
  const profilesLoading = useProfilingStore((state) => state.loading)
  
  const [transformModalOpen, setTransformModalOpen] = useState(false)
  const [pendingConnection, setPendingConnection] = useState<{
    source: string
    target: string
  } | null>(null)
  
  const [newTableModalOpen, setNewTableModalOpen] = useState(false)
  
  const [cycleWarning, setCycleWarning] = useState<string | null>(null)
  
  const { handleSetViewMode } = useCanvasViewMode()

  const requestConnection = useCallback((sourceId: string, targetId: string) => {
    const sourceNode = projectNodes[sourceId]
    const targetNode = projectNodes[targetId]
    const sourceIsTable = sourceNode?.kind === 'source_table' || sourceNode?.kind === 'derived_table'
    const targetIsTable = targetNode?.kind === 'source_table' || targetNode?.kind === 'derived_table'

    if (!sourceIsTable || !targetIsTable) {
      setCycleWarning('Charts cannot start transformations. Connect two tables instead.')
      return
    }
    if (wouldCreateCycle(projectEdges, sourceId, targetId)) {
      setCycleWarning(
        `Cannot connect "${sourceNode.name}" to "${targetNode.name}" because it would create a circular dependency. Choose a different table.`,
      )
      return
    }

    setCycleWarning(null)
    setPendingConnection({ source: sourceId, target: targetId })
    setTransformModalOpen(true)
  }, [projectEdges, projectNodes])

  const initialNodes: Node[] = useMemo(() => {
    return (Object.values(projectNodes) as ProjectNode[]).map((node) => ({
      id: node.id,
      type: node.kind === 'chart' ? 'chartNode' : 'tableNode',
      position: node.ui.position,
      data: {
        ...node,
        selected: node.id === selectedNodeId,
        profile: (node.kind === 'source_table' || node.kind === 'derived_table') 
          ? profiles[node.id] 
          : undefined,
        profileLoading: (node.kind === 'source_table' || node.kind === 'derived_table')
          ? profilesLoading[node.id]
          : false,
        patches: (node.kind === 'source_table' || node.kind === 'derived_table')
          ? patches[node.id]
          : undefined,
        onSetViewMode: handleSetViewMode,
      },
      selected: node.id === selectedNodeId,
    }))
  }, [
    projectNodes,
    selectedNodeId,
    profiles,
    profilesLoading,
    patches,
    handleSetViewMode,
  ])

  const baseEdges: Edge[] = useMemo(() => {
    return (Object.values(projectEdges) as ProjectEdge[]).map((edge) => ({
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      type: 'smoothstep',
      animated: false,
      label: edge.transformType,
      pathOptions: {
        offset: 25,
        borderRadius: 10,
      },
      zIndex: 0,
      style: {
        strokeWidth: 2.5,
        stroke: 'var(--edge-color)',
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
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const fittedNodeKeyRef = useRef('')

  useLayoutEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialEdges, initialNodes, setEdges, setNodes])

  useLayoutEffect(() => {
    if (!flowInstance || nodes.length === 0) return

    const nodeKey = `${projectId}:${nodes.map(node => node.id).sort().join('|')}`
    if (fittedNodeKeyRef.current === nodeKey) return
    fittedNodeKeyRef.current = nodeKey

    void flowInstance.fitView({
      padding: 0.08,
      maxZoom: 1.1,
      duration: 0,
    })
  }, [flowInstance, nodes, projectId])

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setNodes(currentNodes => {
        const updatedNodes = currentNodes.map(current =>
          current.id === node.id ? { ...current, position: node.position } : current
        )
        setEdges(computeSmartEdges(updatedNodes, baseEdges))
        return updatedNodes
      })
      updateNodePosition(node.id, node.position)
    },
    [baseEdges, setEdges, setNodes, updateNodePosition]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id)
      
      const projectNode = projectNodes[node.id]
      if (projectNode?.kind === 'chart') {
        onNodeDoubleClickProp(node.id)
      }
    },
    [selectNode, projectNodes, onNodeDoubleClickProp]
  )

  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const projectNode = projectNodes[node.id]
      if (projectNode?.kind !== 'chart') {
        onNodeDoubleClickProp(node.id)
      }
    },
    [onNodeDoubleClickProp, projectNodes]
  )

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) {
      requestConnection(connection.source, connection.target)
    }
  }, [requestConnection])

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  useCanvasKeyboard()

  const handleAutoArrange = useCallback((direction: LayoutDirection = 'LR') => {
    if (nodes.length === 0) return
    
    const layoutedNodes = getLayoutedNodes(nodes, edges, { direction })
    
    layoutedNodes.forEach((node) => {
      updateNodePosition(node.id, node.position)
    })
    
    setNodes(layoutedNodes)
    
    const smartEdges = computeSmartEdges(layoutedNodes, baseEdges)
    setEdges(smartEdges)
  }, [nodes, edges, baseEdges, updateNodePosition, setNodes, setEdges])

  const handleTransformModalClose = () => {
    setTransformModalOpen(false)
    setPendingConnection(null)
  }

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 canvas-grid" />
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={onPaneClick}
        onInit={setFlowInstance}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 1.1 }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: {
            strokeWidth: 2.5,
            stroke: 'var(--edge-color)',
          },
        }}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineComponent={CustomConnectionLine}
        minZoom={0.2}
        maxZoom={2}
        elevateNodesOnSelect={false}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        {Object.keys(projectNodes).length > 1 && (
          <CanvasAutoArrangePanel onArrange={handleAutoArrange} />
        )}
        
        <Controls 
          showInteractive={false}
          position="bottom-left"
          style={{ marginLeft: 12, marginBottom: 12 }}
          className="!z-sticky !bg-surface !border !border-border !rounded-lg !shadow-md [&>button]:!bg-surface [&>button]:!border-0 [&>button]:!text-text-secondary [&>button:hover]:!bg-surface-secondary"
        />
        
        {Object.keys(projectNodes).length === 0 && (
          <CanvasEmptyState onNewTable={() => setNewTableModalOpen(true)} />
        )}
      </ReactFlow>

      {transformModalOpen && pendingConnection && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center"><div className="bg-surface rounded-lg p-8 animate-pulse">Loading table options…</div></div>}>
          <TransformModal
            isOpen={transformModalOpen}
            onClose={handleTransformModalClose}
            sourceNodeId={pendingConnection.source}
            targetNodeId={pendingConnection.target}
          />
        </Suspense>
      )}
      
      {newTableModalOpen && (
        <NewTableModal
          isOpen={newTableModalOpen}
          onClose={() => setNewTableModalOpen(false)}
        />
      )}
      
      <CycleWarningToast warning={cycleWarning} onClose={() => setCycleWarning(null)} />
    </div>
  )
}
