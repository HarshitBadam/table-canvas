import { useLayoutEffect, useRef } from 'react'
import {
  type Node,
  useNodesInitialized,
  useReactFlow,
  useUpdateNodeInternals,
} from 'reactflow'

import {
  acknowledgeCanvasImportBatches,
  useCanvasImportBatchStore,
} from '@/state/runtime/canvasImportBatchStore'
import { getCanvasFitViewOptions } from './canvasFitViewOptions'

const EMPTY_CANVAS_FIRST_NODE_CENTER = { x: 270, y: 190 }

interface CanvasFitViewProps {
  nodes: Node[]
  projectId: string | null
}

export function CanvasFitView({
  nodes,
  projectId,
}: CanvasFitViewProps) {
  const { fitView, setCenter, viewportInitialized } = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const nodesInitialized = useNodesInitialized()
  const activeBatches = useCanvasImportBatchStore(state => state.activeBatches)
  const completedBatches = useCanvasImportBatchStore(state => state.completedBatches)
  const fittedProjectRef = useRef<string | null | undefined>(undefined)
  const pendingProjectFitRef = useRef<string | null | undefined>(undefined)
  const initializedEmptyProjectRef = useRef<string | null | undefined>(undefined)
  const visibleNodeIdsRef = useRef<Set<string>>(new Set())

  useLayoutEffect(() => {
    const projectHasActiveBatch = Object.values(activeBatches)
      .some(batch => batch.projectId === projectId)
    const projectBatches = completedBatches.filter(batch => batch.projectId === projectId)
    const projectBatchIds = projectBatches.map(batch => batch.id)
    const currentNodeIds = new Set(nodes.map(node => node.id))
    const previousCount = visibleNodeIdsRef.current.size
    const addedNodeIds = nodes
      .filter(node => !visibleNodeIdsRef.current.has(node.id))
      .map(node => node.id)
    const grewFromEmptyCanvas = previousCount === 0
      && initializedEmptyProjectRef.current === projectId

    if (nodes.length === 0) {
      if (viewportInitialized && initializedEmptyProjectRef.current !== projectId) {
        setCenter(
          EMPTY_CANVAS_FIRST_NODE_CENTER.x,
          EMPTY_CANVAS_FIRST_NODE_CENTER.y,
          { zoom: 1, duration: 0 },
        )
        initializedEmptyProjectRef.current = projectId
      }
      visibleNodeIdsRef.current = currentNodeIds
      if (projectBatches.length > 0) acknowledgeCanvasImportBatches(projectBatchIds)
      return
    }

    // Empty first node: keep the pre-centered viewport, no animated fit.
    if (nodes.length === 1 && grewFromEmptyCanvas) {
      visibleNodeIdsRef.current = currentNodeIds
      if (projectBatches.length > 0) acknowledgeCanvasImportBatches(projectBatchIds)
      return
    }

    initializedEmptyProjectRef.current = undefined

    if (fittedProjectRef.current === undefined) {
      fittedProjectRef.current = projectId
      visibleNodeIdsRef.current = currentNodeIds
      if (!projectHasActiveBatch) {
        acknowledgeCanvasImportBatches(projectBatchIds)
        return
      }
    } else if (fittedProjectRef.current !== projectId) {
      fittedProjectRef.current = projectId
      pendingProjectFitRef.current = projectId
      visibleNodeIdsRef.current = currentNodeIds
    }

    const scheduleMeasuredFit = (
      nodeIds: string[],
      isCurrent: () => boolean,
      onSuccess: () => void,
    ) => {
      let cancelled = false
      let frame = 0

      const fitMeasuredGraph = () => {
        if (cancelled || !isCurrent()) return
        updateNodeInternals(nodeIds)
        frame = window.requestAnimationFrame(() => {
          if (cancelled || !isCurrent()) return
          if (fitView(getCanvasFitViewOptions(nodes.length))) {
            onSuccess()
            return
          }
          fitMeasuredGraph()
        })
      }

      fitMeasuredGraph()
      return () => {
        cancelled = true
        window.cancelAnimationFrame(frame)
      }
    }

    if (pendingProjectFitRef.current === projectId) {
      if (projectHasActiveBatch || !nodesInitialized || !viewportInitialized) return
      return scheduleMeasuredFit(
        nodes.map(node => node.id),
        () => pendingProjectFitRef.current === projectId,
        () => {
          pendingProjectFitRef.current = undefined
          acknowledgeCanvasImportBatches(projectBatchIds)
        },
      )
    }

    if (!nodesInitialized || !viewportInitialized) return

    // Import, undo/redo, duplicate, etc.: refit whenever the graph gains nodes.
    if (addedNodeIds.length === 0 || nodes.length <= 1) {
      visibleNodeIdsRef.current = currentNodeIds
      if (!projectHasActiveBatch && projectBatches.length > 0) {
        acknowledgeCanvasImportBatches(projectBatchIds)
      }
      return
    }

    return scheduleMeasuredFit(
      addedNodeIds,
      () => addedNodeIds.every(id => currentNodeIds.has(id)),
      () => {
        visibleNodeIdsRef.current = currentNodeIds
        if (!projectHasActiveBatch) acknowledgeCanvasImportBatches(projectBatchIds)
      },
    )
  }, [
    activeBatches,
    completedBatches,
    fitView,
    nodes,
    nodesInitialized,
    projectId,
    setCenter,
    updateNodeInternals,
    viewportInitialized,
  ])

  return null
}
