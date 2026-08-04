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
  type NodeChange,
  ConnectionLineType,
  ConnectionMode,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useProjectStore } from '@/state/projectStore'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import { useWorkspaceLease } from '@/state/document/useWorkspaceLease'
import { LoadingSpinner } from '@/layout/LoadingSpinner'
import type { ProjectNode, Edge as ProjectEdge } from '@/types'
import { useCanvasKeyboard } from './useCanvasKeyboard'
import { useCanvasViewMode } from './useCanvasViewMode'
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
  const saveSnapshot = useProjectStore((state) => state.saveSnapshot)
  const selectNode = useProjectStore((state) => state.selectNode)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)

  const runtimeSchemas = useTableRuntimeStore((state) => state.schemas)

  const [transformModalOpen, setTransformModalOpen] = useState(false)
  const [pendingConnection, setPendingConnection] = useState<{
    source: string
    target: string
  } | null>(null)

  const [newTableModalOpen, setNewTableModalOpen] = useState(false)

  const [cycleWarning, setCycleWarning] = useState<string | null>(null)

  const { handleSetViewMode } = useCanvasViewMode()
  const { canEdit } = useWorkspaceLease()

  const dismissCycleWarning = useCallback(() => setCycleWarning(null), [])

  const requestConnection = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return
    }

    const sourceNode = projectNodes[sourceId]
    const targetNode = projectNodes[targetId]
    const sourceIsTable = sourceNode?.kind === 'source_table' || sourceNode?.kind === 'derived_table'
    const targetIsTable = targetNode?.kind === 'source_table' || targetNode?.kind === 'derived_table'

    if (!sourceIsTable || !targetIsTable) {
      setCycleWarning('Charts cannot start transformations. Connect two tables instead.')
      return
    }

    setCycleWarning(null)
    setPendingConnection({ source: sourceId, target: targetId })
    setTransformModalOpen(true)
  }, [projectNodes])

  const initialNodes: Node[] = useMemo(() => {
    return (Object.values(projectNodes) as ProjectNode[]).map((node) => ({
      id: node.id,
      type: node.kind === 'chart' ? 'chartNode' : 'tableNode',
      position: node.ui.position,
      data: {
        ...node,
        schema: runtimeSchemas[node.id] ?? ('schema' in node ? node.schema : undefined),
        patches: (node.kind === 'source_table' || node.kind === 'derived_table')
          ? patches[node.id]
          : undefined,
        onSetViewMode: handleSetViewMode,
      },
      selected: node.id === selectedNodeId,
    }))
  }, [
    projectNodes,
    runtimeSchemas,
    selectedNodeId,
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
      pathOptions: {
        offset: 25,
        borderRadius: 10,
      },
      zIndex: 0,
      style: {
        strokeWidth: 2.5,
        stroke: 'var(--edge-color)',
      },
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
  const fittedProjectRef = useRef<string | null | undefined>(undefined)
  const visibleNodeIdsRef = useRef<Set<string>>(new Set())
  const pendingFitNodeIdRef = useRef<string | null>(null)
  const dragStartRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null)

  useLayoutEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialEdges, initialNodes, setEdges, setNodes])

  useLayoutEffect(() => {
    if (!flowInstance || nodes.length === 0) return

    const currentNodeIds = new Set(nodes.map(node => node.id))
    if (fittedProjectRef.current !== projectId) {
      fittedProjectRef.current = projectId
      visibleNodeIdsRef.current = currentNodeIds
      pendingFitNodeIdRef.current = null
      void flowInstance.fitView({
        padding: 0.08,
        maxZoom: 1.1,
        duration: 0,
      })
      return
    }

    const addedNodes = nodes.filter(node => !visibleNodeIdsRef.current.has(node.id))
    visibleNodeIdsRef.current = currentNodeIds
    const addedTarget = addedNodes.find(node => node.id === selectedNodeId)
      ?? addedNodes[addedNodes.length - 1]
    if (addedTarget) pendingFitNodeIdRef.current = addedTarget.id

    const pendingTarget = nodes.find(node => node.id === pendingFitNodeIdRef.current)
    const pendingSchema = pendingTarget?.data?.schema
    if (!pendingTarget || !pendingSchema || pendingSchema.columns.length === 0) return

    pendingFitNodeIdRef.current = null
    const frame = window.requestAnimationFrame(() => void flowInstance.fitView({
      padding: 0.08,
      maxZoom: 1.1,
      duration: 180,
    }))
    return () => window.cancelAnimationFrame(frame)
  }, [flowInstance, nodes, projectId, selectedNodeId])

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setNodes(currentNodes => {
        const updatedNodes = currentNodes.map(current =>
          current.id === node.id ? { ...current, position: node.position } : current
        )
        setEdges(computeSmartEdges(updatedNodes, baseEdges))
        return updatedNodes
      })
      const start = dragStartRef.current
      dragStartRef.current = null
      if (
        !start
        || start.id !== node.id
        || start.position.x !== node.position.x
        || start.position.y !== node.position.y
      ) {
        saveSnapshot(`Move node ${projectNodes[node.id]?.name ?? node.id}`)
      }
      updateNodePosition(node.id, node.position)
    },
    [baseEdges, projectNodes, saveSnapshot, setEdges, setNodes, updateNodePosition]
  )

  const onNodeDragStart: NodeMouseHandler = useCallback(
    (_: React.MouseEvent, node: Node) => {
      dragStartRef.current = {
        id: node.id,
        position: { ...node.position },
      }
    },
    [],
  )

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes.filter(change => change.type !== 'remove'))
  }, [onNodesChange])

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
    saveSnapshot('Auto-arrange canvas')

    const layoutedNodes = getLayoutedNodes(nodes, edges, { direction })

    layoutedNodes.forEach((node) => {
      updateNodePosition(node.id, node.position)
    })

    setNodes(layoutedNodes)

    const smartEdges = computeSmartEdges(layoutedNodes, baseEdges)
    setEdges(smartEdges)
  }, [nodes, edges, baseEdges, updateNodePosition, saveSnapshot, setNodes, setEdges])

  const handleTransformModalClose = () => {
    setTransformModalOpen(false)
  }

  const handleTransformModalDismiss = () => {
    setTransformModalOpen(false)
    setPendingConnection(null)
  }

  return (
    <div className="h-full w-full relative">
      <div className="absolute inset-0 canvas-grid" />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
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
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        // Deletion is mediated by useCanvasKeyboard so it can ask for confirmation.
        // An empty shortcut list prevents React Flow from removing the rendered node
        // before that confirmation is resolved.
        deleteKeyCode={[]}
        connectionRadius={36}
        nodeDragThreshold={4}
        connectOnClick={false}
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
          className="!z-sticky !rounded-lg !border !border-border !bg-surface !shadow-md [&>button]:!border-0 [&>button]:!bg-surface [&>button]:!text-text-secondary [&>button:hover]:!bg-surface-secondary"
        />

        {Object.keys(projectNodes).length === 0 && (
          <CanvasEmptyState onNewTable={() => setNewTableModalOpen(true)} />
        )}
      </ReactFlow>

      {pendingConnection && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center"><div className="bg-surface rounded-lg p-8 animate-pulse">Loading table options…</div></div>}>
          <TransformModal
            isOpen={transformModalOpen}
            onClose={handleTransformModalClose}
            onDismiss={handleTransformModalDismiss}
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

      <CycleWarningToast warning={cycleWarning} onClose={dismissCycleWarning} />
    </div>
  )
}
