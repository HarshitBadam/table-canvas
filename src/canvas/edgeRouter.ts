import type { Node, Edge } from 'reactflow'

// Node dimensions - match actual node sizes (fixed width for all views)
const NODE_WIDTH = 340
const NODE_HEIGHT = 200

// Handle dimensions - updated for larger hit areas (used for visual reference)
// Visual handle size: 16px, Handle offset from edge: 9px

// SmartEdge is just Edge with guaranteed handles - compatible with Edge[]
export type SmartEdge = Edge

type HandlePosition = 'left' | 'right' | 'top' | 'bottom'
interface Point { x: number; y: number }

/**
 * Get node center point
 */
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
  
  // Step 1: Group edges by target
  const edgesByTarget = new Map<string, Edge[]>()
  edges.forEach(edge => {
    const list = edgesByTarget.get(edge.target) || []
    list.push(edge)
    edgesByTarget.set(edge.target, list)
  })
  
  // Step 2: For each target, determine the single handle all sources will connect to
  const targetHandleMap = new Map<string, HandlePosition>()
  
  edgesByTarget.forEach((targetEdges, targetId) => {
    const targetNode = nodeMap.get(targetId)
    if (!targetNode) return
    
    const targetCenter = getNodeCenter(targetNode)
    
    // Count how many sources are in each direction
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
      
      // Categorize by dominant direction
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
  
  // Step 3: Compute each edge with consistent target handle
  return edges.map(edge => {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)
    
    if (!sourceNode || !targetNode) {
      return { ...edge, sourceHandle: 'right', targetHandle: 'left' }
    }
    
    const targetHandle = targetHandleMap.get(edge.target) || 'left'
    
    // Source handle: pick the one that points toward target
    const sourceCenter = getNodeCenter(sourceNode)
    const targetCenter = getNodeCenter(targetNode)
    const dx = targetCenter.x - sourceCenter.x
    const dy = targetCenter.y - sourceCenter.y
    
    let sourceHandle: HandlePosition
    
    // Pick source handle based on direction to target
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal: use left or right
      sourceHandle = dx > 0 ? 'right' : 'left'
    } else {
      // Vertical: use top or bottom
      sourceHandle = dy > 0 ? 'bottom' : 'top'
    }
    
    return {
      ...edge,
      sourceHandle,
      targetHandle,
    }
  })
}

// Legacy export for backward compatibility
export function getSmartHandles(
  sourcePos: Point,
  targetPos: Point,
  _sourceType?: string,
  _targetType?: string
): { sourceHandle: string; targetHandle: string } {
  const dx = targetPos.x - sourcePos.x
  const dy = targetPos.y - sourcePos.y
  
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' }
  } else {
    return dy > 0
      ? { sourceHandle: 'bottom', targetHandle: 'top' }
      : { sourceHandle: 'top', targetHandle: 'bottom' }
  }
}
