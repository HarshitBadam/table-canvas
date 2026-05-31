import type { Node, Edge } from 'reactflow'
import { NODE_WIDTH, NODE_HEIGHT } from './canvasConstants'

// SmartEdge is just Edge with guaranteed handles - compatible with Edge[]
export type SmartEdge = Edge

type HandlePosition = 'left' | 'right' | 'top' | 'bottom'
interface Point { x: number; y: number }

function getNodeCenter(node: Node): Point {
  return {
    x: node.position.x + NODE_WIDTH / 2,
    y: node.position.y + NODE_HEIGHT / 2,
  }
}

/**
 * Compute edges with consistent handles for clean DAG visualization.
 * 
 * Rules:
 * 1. All edges to the same target use the SAME target handle
 * 2. Target handle is determined by where the majority of sources are located
 * 3. Source handles point toward the target
 */
export function computeSmartEdges(
  nodes: Node[],
  edges: Edge[]
): SmartEdge[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  
  const edgesByTarget = new Map<string, Edge[]>()
  edges.forEach(edge => {
    const list = edgesByTarget.get(edge.target) || []
    list.push(edge)
    edgesByTarget.set(edge.target, list)
  })
  
  const targetHandleMap = new Map<string, HandlePosition>()
  
  edgesByTarget.forEach((targetEdges, targetId) => {
    const targetNode = nodeMap.get(targetId)
    if (!targetNode) return
    
    const targetCenter = getNodeCenter(targetNode)
    
    let leftCount = 0
    let rightCount = 0
    let aboveCount = 0
    let belowCount = 0
    
    targetEdges.forEach(edge => {
      const sourceNode = nodeMap.get(edge.source)
      if (!sourceNode) return
      
      const sourceCenter = getNodeCenter(sourceNode)
      const dx = sourceCenter.x - targetCenter.x
      const dy = sourceCenter.y - targetCenter.y
      
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) leftCount++
        else rightCount++
      } else {
        if (dy < 0) aboveCount++
        else belowCount++
      }
    })
    
    // Pick target handle based on where most sources are
    // Sources on left → target uses LEFT handle
    // Sources above → target uses TOP handle
    const maxCount = Math.max(leftCount, rightCount, aboveCount, belowCount)
    
    let targetHandle: HandlePosition = 'top' // default
    if (maxCount === leftCount) targetHandle = 'left'
    else if (maxCount === rightCount) targetHandle = 'right'
    else if (maxCount === aboveCount) targetHandle = 'top'
    else if (maxCount === belowCount) targetHandle = 'bottom'
    
    targetHandleMap.set(targetId, targetHandle)
  })
  
  return edges.map(edge => {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)
    
    if (!sourceNode || !targetNode) {
      return { ...edge, sourceHandle: 'right', targetHandle: 'left' }
    }
    
    const targetHandle = targetHandleMap.get(edge.target) || 'left'
    
    const sourceCenter = getNodeCenter(sourceNode)
    const targetCenter = getNodeCenter(targetNode)
    const dx = targetCenter.x - sourceCenter.x
    const dy = targetCenter.y - sourceCenter.y
    
    let sourceHandle: HandlePosition
    if (Math.abs(dx) > Math.abs(dy)) {
      sourceHandle = dx > 0 ? 'right' : 'left'
    } else {
      sourceHandle = dy > 0 ? 'bottom' : 'top'
    }
    
    return {
      ...edge,
      sourceHandle,
      targetHandle,
    }
  })
}

