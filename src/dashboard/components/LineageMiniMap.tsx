import { useMemo } from 'react'
import dagre from 'dagre'
import type { LineageNode, LineageEdge } from '../dashboardHelpers'

interface LineageMiniMapProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  onNodeClick: (nodeId: string) => void
}

export function LineageMiniMap({ nodes, edges, onNodeClick }: LineageMiniMapProps) {
  const sourceNodes = useMemo(() => nodes.filter(n => n.kind === 'source_table'), [nodes])
  const derivedNodes = useMemo(() => nodes.filter(n => n.kind === 'derived_table'), [nodes])
  const chartNodes = useMemo(() => nodes.filter(n => n.kind === 'chart'), [nodes])

  if (nodes.length === 0 || (derivedNodes.length === 0 && chartNodes.length === 0 && edges.length === 0)) {
    return null
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Data Flow</h3>
          <span className="text-xs text-text-tertiary">
            {sourceNodes.length} source{sourceNodes.length !== 1 ? 's' : ''} - {derivedNodes.length} derived{chartNodes.length > 0 ? ` - ${chartNodes.length} chart${chartNodes.length !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-text-tertiary">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-accent-green" />
            <span>Source</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-violet-500" />
            <span>Derived</span>
          </div>
          {chartNodes.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded bg-blue-500" />
              <span>Chart</span>
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--color-border) 1px, transparent 1px),
              linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
            opacity: 0.4,
          }}
        />
        
        <div className="relative p-8">
          <LineageVisualization 
            nodes={nodes}
            edges={edges}
            onNodeClick={onNodeClick}
          />
        </div>
      </div>
    </div>
  )
}

const MINIMAP_NODE_WIDTH = 140
const MINIMAP_NODE_HEIGHT = 60

function LineageVisualization({ 
  nodes, 
  edges, 
  onNodeClick 
}: { 
  nodes: LineageNode[]
  edges: LineageEdge[]
  onNodeClick: (nodeId: string) => void
}) {
  const { nodePositions, graphWidth, graphHeight } = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    
    g.setGraph({ 
      rankdir: 'TB', 
      nodesep: 60,
      ranksep: 80,
      marginx: 40,
      marginy: 40,
    })
    
    // Default edge label (required by Dagre)
    g.setDefaultEdgeLabel(() => ({}))
    
    nodes.forEach(node => {
      g.setNode(node.id, { 
        width: MINIMAP_NODE_WIDTH, 
        height: MINIMAP_NODE_HEIGHT,
        label: node.name,
      })
    })
    
    edges.forEach(edge => {
      g.setEdge(edge.from, edge.to)
    })
    
    dagre.layout(g)
    
    const positions: Map<string, { x: number; y: number }> = new Map()
    nodes.forEach(node => {
      const nodeData = g.node(node.id)
      if (nodeData) {
        positions.set(node.id, {
          x: nodeData.x,
          y: nodeData.y,
        })
      }
    })
    
    const graphData = g.graph()
    const width = (graphData?.width || 400) + 80
    const height = (graphData?.height || 200) + 80
    
    return { 
      nodePositions: positions, 
      graphWidth: Math.max(width, 400),
      graphHeight: Math.max(height, 150),
    }
  }, [nodes, edges])

  const containerHeight = Math.min(graphHeight, 400)

  return (
    <div 
      className="relative overflow-auto scrollbar-hide flex justify-center" 
      style={{ height: `${containerHeight}px`, minHeight: '200px' }}
    >
      <div className="relative" style={{ width: graphWidth, height: graphHeight }}>
        <svg 
          className="absolute pointer-events-none"
          width={graphWidth}
          height={graphHeight}
          style={{ overflow: 'visible' }}
        >
        <defs>
          <linearGradient id="flowEdgeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#217346" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.5" />
          </linearGradient>
          
          {/* Solid color for print */}
          <linearGradient id="flowEdgePrint" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6B7280" />
            <stop offset="100%" stopColor="#6B7280" />
          </linearGradient>
          
          <marker
            id="flowArrowhead"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 Z"
              fill="#8B5CF6"
              opacity="0.6"
            />
          </marker>
        </defs>

        {edges.map((edge) => {
          const fromPos = nodePositions.get(edge.from)
          const toPos = nodePositions.get(edge.to)
          
          if (!fromPos || !toPos) return null
          
          const fromY = fromPos.y + MINIMAP_NODE_HEIGHT / 2
          const toY = toPos.y - MINIMAP_NODE_HEIGHT / 2
          const midY = (fromY + toY) / 2
          
          const path = `
            M ${fromPos.x} ${fromY}
            C ${fromPos.x} ${midY}, 
              ${toPos.x} ${midY}, 
              ${toPos.x} ${toY}
          `
          
          return (
            <g key={edge.id}>
              <path
                d={path}
                fill="none"
                stroke="#8B5CF6"
                strokeWidth={6}
                strokeOpacity={0.08}
                strokeLinecap="round"
                className="lineage-glow print:hidden"
              />
              <path
                d={path}
                fill="none"
                stroke="url(#flowEdgeGradient)"
                strokeWidth={2}
                strokeLinecap="round"
                markerEnd="url(#flowArrowhead)"
                className="lineage-edge transition-all"
              />
            </g>
          )
        })}
      </svg>

      {nodes.map((node) => {
        const pos = nodePositions.get(node.id)
        if (!pos) return null

        const isSource = node.kind === 'source_table'
        const isChart = node.kind === 'chart'

        const borderClass = isSource 
          ? 'border-[#217346]/30 hover:border-[#217346]'
          : isChart
          ? 'border-blue-500/30 hover:border-blue-500'
          : 'border-violet-500/30 hover:border-violet-500'
        
        const iconBgClass = isSource 
          ? 'bg-accent-green text-white'
          : isChart
          ? 'bg-blue-500 text-white'
          : 'bg-violet-500 text-white'
        
        const textClass = isSource 
          ? 'text-accent-green group-hover:text-accent-green-hover'
          : isChart
          ? 'text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300'
          : 'text-violet-600 dark:text-violet-400 group-hover:text-violet-700 dark:group-hover:text-violet-300'

        return (
          <button
            key={node.id}
            onClick={() => onNodeClick(node.id)}
            className={`
              absolute transform -translate-x-1/2 -translate-y-1/2
              bg-white dark:bg-gray-800
              rounded-xl border-2
              px-4 py-2.5
              transition-all duration-200
              hover:scale-105 hover:-translate-y-[calc(50%+4px)]
              focus:outline-none
              group lineage-node
              ${borderClass}
            `}
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              boxShadow: '0 2px 8px -2px rgba(0,0,0,0.1), 0 4px 16px -4px rgba(0,0,0,0.1)',
              minWidth: '120px',
              maxWidth: '160px',
            }}
            title={isChart ? node.name : `${node.name} (${node.rowCount.toLocaleString()} rows)`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgClass}`}>
                {isChart ? (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 13h2v8H3v-8zm4-6h2v14H7V7zm4 3h2v11h-2V10zm4-6h2v17h-2V4zm4 8h2v9h-2v-9z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm2 0h14v4H5V5zm0 6h4v8H5v-8zm6 0h8v8h-8v-8z" />
                  </svg>
                )}
              </div>
              <span className={`text-sm font-medium truncate ${textClass}`}>
                {node.name}
              </span>
            </div>
            
            <div className="mt-1 text-left text-xs text-text-tertiary">
              {isChart ? (node.chartType || 'Chart') : `${node.rowCount.toLocaleString()} rows`}
            </div>
          </button>
        )
      })}
      </div>
    </div>
  )
}
