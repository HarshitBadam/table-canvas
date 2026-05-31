import dagre from 'dagre'
import { Node, Edge } from 'reactflow'
import { NODE_WIDTH } from './canvasConstants'

const BASE_HEIGHTS = {
  collapsed: 180,  // Schema view - shows 4 columns max
  data: 280,       // Data preview - fixed height table
  stats: 200,      // Stats base height
}

// Per-column height for stats view (each column profile card is ~80px)
const STATS_PER_COLUMN_HEIGHT = 85

const LAYOUT_CONFIG = {
  rankdir: 'LR',
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

function getNodeHeight(node: Node): number {
  const viewMode = node.data?.ui?.viewMode || (node.data?.ui?.expanded ? 'stats' : 'collapsed')
  const columnCount = node.data?.schema?.columns?.length || 4
  
  switch (viewMode) {
    case 'stats': {
      // Stats view height depends on number of columns
      // Header (~100px) + each column card (~85px) + padding
      const statsHeight = BASE_HEIGHTS.stats + (Math.min(columnCount, 6) * STATS_PER_COLUMN_HEIGHT)
      return Math.min(statsHeight, 600)
    }
    case 'data': 
      return BASE_HEIGHTS.data
    default: 
      return BASE_HEIGHTS.collapsed
  }
}

export function getLayoutedNodes(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const { direction = 'LR', spacing = 1 } = options
  const isVertical = direction === 'TB' || direction === 'BT'

  const hasExpandedNodes = nodes.some(node => {
    const viewMode = node.data?.ui?.viewMode || (node.data?.ui?.expanded ? 'stats' : 'collapsed')
    return viewMode === 'stats' || viewMode === 'data'
  })

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  
  // For vertical layout with expanded nodes, increase both rank and node separation
  const ranksep = isVertical && hasExpandedNodes 
    ? LAYOUT_CONFIG.ranksep * spacing * 1.5 
    : LAYOUT_CONFIG.ranksep * spacing
  const nodesep = hasExpandedNodes 
    ? LAYOUT_CONFIG.nodesep * spacing * 1.2 
    : LAYOUT_CONFIG.nodesep * spacing
  
  dagreGraph.setGraph({
    ...LAYOUT_CONFIG,
    rankdir: direction,
    ranksep,
    nodesep,
  })

  nodes.forEach((node) => {
    const height = getNodeHeight(node)
    dagreGraph.setNode(node.id, { 
      width: NODE_WIDTH, 
      height,
    })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

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
