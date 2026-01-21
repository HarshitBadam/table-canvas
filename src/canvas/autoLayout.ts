import dagre from 'dagre'
import { Node, Edge } from 'reactflow'

// Node dimensions for layout calculation
const NODE_WIDTH = 340

// Base heights for different view modes
const BASE_HEIGHTS = {
  collapsed: 180,  // Schema view - shows 4 columns max
  data: 280,       // Data preview - fixed height table
  stats: 200,      // Stats base height
}

// Per-column height for stats view (each column profile card is ~80px)
const STATS_PER_COLUMN_HEIGHT = 85

// Layout configuration
const LAYOUT_CONFIG = {
  rankdir: 'LR', // Left to right flow
  ranksep: 120, // Horizontal spacing between columns
  nodesep: 80, // Vertical spacing between nodes in same column (increased for stats view)
  marginx: 50,
  marginy: 50,
}

export type LayoutDirection = 'LR' | 'TB' | 'RL' | 'BT'

interface LayoutOptions {
  direction?: LayoutDirection
  spacing?: number
}

/**
 * Get estimated node height based on view mode and content
 */
function getNodeHeight(node: Node): number {
  const viewMode = node.data?.ui?.viewMode || (node.data?.ui?.expanded ? 'stats' : 'collapsed')
  const columnCount = node.data?.schema?.columns?.length || 4
  
  switch (viewMode) {
    case 'stats': {
      // Stats view height depends on number of columns
      // Header (~100px) + each column card (~85px) + padding
      const statsHeight = BASE_HEIGHTS.stats + (Math.min(columnCount, 6) * STATS_PER_COLUMN_HEIGHT)
      return Math.min(statsHeight, 600) // Cap at 600px
    }
    case 'data': 
      return BASE_HEIGHTS.data
    default: 
      return BASE_HEIGHTS.collapsed
  }
}

/**
 * Apply dagre auto-layout to nodes
 * Returns new positions for all nodes
 */
export function getLayoutedNodes(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const { direction = 'LR', spacing = 1 } = options
  const isVertical = direction === 'TB' || direction === 'BT'

  // Check if any node is in an expanded view mode
  const hasExpandedNodes = nodes.some(node => {
    const viewMode = node.data?.ui?.viewMode || (node.data?.ui?.expanded ? 'stats' : 'collapsed')
    return viewMode === 'stats' || viewMode === 'data'
  })

  // Create dagre graph
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  
  // For vertical layout with expanded nodes, increase both rank and node separation
  const ranksep = isVertical && hasExpandedNodes 
    ? LAYOUT_CONFIG.ranksep * spacing * 1.5 
    : LAYOUT_CONFIG.ranksep * spacing
  const nodesep = hasExpandedNodes 
    ? LAYOUT_CONFIG.nodesep * spacing * 1.2 
    : LAYOUT_CONFIG.nodesep * spacing
  
  // Configure layout
  dagreGraph.setGraph({
    ...LAYOUT_CONFIG,
    rankdir: direction,
    ranksep,
    nodesep,
  })

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    const height = getNodeHeight(node)
    dagreGraph.setNode(node.id, { 
      width: NODE_WIDTH, 
      height,
    })
  })

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  // Run layout algorithm
  dagre.layout(dagreGraph)

  // Apply calculated positions to nodes
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    const height = getNodeHeight(node)
    
    return {
      ...node,
      position: {
        // Dagre returns center position, convert to top-left
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - height / 2,
      },
    }
  })
}

/**
 * Check if layout would benefit from auto-arrangement
 * Returns true if nodes seem disorganized
 */
export function shouldSuggestAutoLayout(nodes: Node[], edges: Edge[]): boolean {
  if (nodes.length < 2) return false
  
  // Check for edge crossings or poor alignment
  let hasBackwardEdges = false
  
  edges.forEach((edge) => {
    const sourceNode = nodes.find(n => n.id === edge.source)
    const targetNode = nodes.find(n => n.id === edge.target)
    
    if (sourceNode && targetNode) {
      // In LR layout, source should be left of target
      if (sourceNode.position.x > targetNode.position.x + NODE_WIDTH) {
        hasBackwardEdges = true
      }
    }
  })
  
  return hasBackwardEdges
}

/**
 * Get layout statistics for debugging
 */
export function getLayoutStats(nodes: Node[], edges: Edge[]) {
  const sourceNodes = nodes.filter(n => n.data?.kind === 'source_table')
  const derivedNodes = nodes.filter(n => n.data?.kind === 'derived_table')
  const chartNodes = nodes.filter(n => n.data?.kind === 'chart')
  
  return {
    totalNodes: nodes.length,
    sourceNodes: sourceNodes.length,
    derivedNodes: derivedNodes.length,
    chartNodes: chartNodes.length,
    edges: edges.length,
  }
}
