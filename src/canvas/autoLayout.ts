import dagre from 'dagre'
import { Node, Edge } from 'reactflow'
import { NODE_WIDTH } from './canvasConstants'

const BASE_HEIGHTS = {
  collapsed: 180,  // Schema view - shows 4 columns max
  data: 280,       // Data preview - fixed height table
}

const LAYOUT_CONFIG = {
  rankdir: 'LR',
  ranksep: 120, // Horizontal spacing between columns
  nodesep: 80, // Vertical spacing between nodes in same column
  marginx: 50,
  marginy: 50,
}

export type LayoutDirection = 'LR' | 'TB' | 'RL' | 'BT'

interface LayoutOptions {
  direction?: LayoutDirection
  spacing?: number
}

export function getNodeHeight(node: Node): number {
  return node.data?.ui?.viewMode === 'data'
    ? BASE_HEIGHTS.data
    : BASE_HEIGHTS.collapsed
}

export function getLayoutedNodes(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const { direction = 'LR', spacing = 1 } = options
  const isVertical = direction === 'TB' || direction === 'BT'

  const hasDataPreviewNodes = nodes.some(node => node.data?.ui?.viewMode === 'data')

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  
  // For vertical layout with data-preview nodes, increase both rank and node separation.
  const ranksep = isVertical && hasDataPreviewNodes
    ? LAYOUT_CONFIG.ranksep * spacing * 1.5 
    : LAYOUT_CONFIG.ranksep * spacing
  const nodesep = hasDataPreviewNodes
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
