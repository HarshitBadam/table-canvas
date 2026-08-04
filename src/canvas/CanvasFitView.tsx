import { useLayoutEffect, useRef } from 'react'
import {
  type FitViewOptions,
  type Node,
  useNodesInitialized,
  useReactFlow,
  useUpdateNodeInternals,
} from 'reactflow'

import { useTableRuntimeStore } from '@/state/tableRuntimeStore'

export const CANVAS_FIT_VIEW_OPTIONS = {
  padding: 0.08,
  maxZoom: 1.1,
} satisfies FitViewOptions

interface CanvasFitViewProps {
  nodes: Node[]
  projectId: string | null
  selectedNodeId: string | null
}

export function CanvasFitView({
  nodes,
  projectId,
  selectedNodeId,
}: CanvasFitViewProps) {
  const { fitView } = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const nodesInitialized = useNodesInitialized()
  const cacheInfo = useTableRuntimeStore(state => state.cacheInfo)
  const fittedProjectRef = useRef<string | null | undefined>(undefined)
  const pendingProjectFitRef = useRef<string | null | undefined>(undefined)
  const visibleNodeIdsRef = useRef<Set<string>>(new Set())
  const pendingFitNodeIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const currentNodeIds = new Set(nodes.map(node => node.id))

    if (nodes.length === 0) {
      visibleNodeIdsRef.current = currentNodeIds
      pendingFitNodeIdRef.current = null
      return
    }

    if (fittedProjectRef.current !== projectId) {
      fittedProjectRef.current = projectId
      pendingProjectFitRef.current = projectId
      visibleNodeIdsRef.current = currentNodeIds
      pendingFitNodeIdRef.current = null
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
          if (fitView(CANVAS_FIT_VIEW_OPTIONS)) {
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
      if (!nodesInitialized) return
      return scheduleMeasuredFit(
        nodes.map(node => node.id),
        () => pendingProjectFitRef.current === projectId,
        () => { pendingProjectFitRef.current = undefined },
      )
    }

    const addedNodes = nodes.filter(node => !visibleNodeIdsRef.current.has(node.id))
    visibleNodeIdsRef.current = currentNodeIds
    const addedTarget = addedNodes.find(node => node.id === selectedNodeId)
      ?? addedNodes[addedNodes.length - 1]
    if (addedTarget) pendingFitNodeIdRef.current = addedTarget.id

    const pendingNodeId = pendingFitNodeIdRef.current
    const pendingNode = nodes.find(node => node.id === pendingNodeId)
    if (!pendingNode) {
      pendingFitNodeIdRef.current = null
      return
    }

    const schema = pendingNode.data?.schema
    if (
      !nodesInitialized
      || cacheInfo[pendingNode.id]?.phase !== 'ready'
      || !schema
      || schema.columns.length === 0
    ) return

    return scheduleMeasuredFit(
      [pendingNode.id],
      () => pendingFitNodeIdRef.current === pendingNode.id,
      () => { pendingFitNodeIdRef.current = null },
    )
  }, [
    cacheInfo,
    fitView,
    nodes,
    nodesInitialized,
    projectId,
    selectedNodeId,
    updateNodeInternals,
  ])

  return null
}
