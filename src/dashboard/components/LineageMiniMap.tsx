/**
 * Data Flow Hero Component
 * 
 * Visual centerpiece showing table relationships with polished aesthetics.
 * Features dot-grid background, curved bezier connections, and larger nodes.
 */

import { useMemo } from 'react'
import type { LineageNode, LineageEdge } from '../useDashboardData'

interface LineageMiniMapProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  onNodeClick: (nodeId: string) => void
}

export function LineageMiniMap({ nodes, edges, onNodeClick }: LineageMiniMapProps) {
  // Separate source and derived tables
  const sourceNodes = useMemo(() => nodes.filter(n => n.kind === 'source_table'), [nodes])
  const derivedNodes = useMemo(() => nodes.filter(n => n.kind === 'derived_table'), [nodes])

  // Don't render if no meaningful lineage to show
  if (nodes.length === 0 || (derivedNodes.length === 0 && edges.length === 0)) {
    return null
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">Data Flow</h3>
          <span className="text-xs text-text-tertiary">
            {sourceNodes.length} source{sourceNodes.length !== 1 ? 's' : ''} → {derivedNodes.length} derived
          </span>
        </div>
        
        {/* Inline Legend */}
        <div className="flex items-center gap-4 text-xs text-text-tertiary">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-node-source-border" />
            <span>Source</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-node-derived-border" />
            <span>Derived</span>
          </div>
        </div>
      </div>

      {/* Visualization with dot-grid background */}
      <div className="relative">
        {/* Dot grid background */}
        <div 
          className="absolute inset-0 opacity-40 dark:opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            color: 'var(--color-border)',
          }}
        />
        
        {/* Content */}
        <div className="relative p-6">
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

// Polished lineage visualization with curved connections
function LineageVisualization({ 
  nodes, 
  edges, 
  onNodeClick 
}: { 
  nodes: LineageNode[]
  edges: LineageEdge[]
  onNodeClick: (nodeId: string) => void
}) {
  // Build a simple layered layout
  const layout = useMemo(() => {
    // Find root nodes (no incoming edges)
    const hasIncoming = new Set(edges.map(e => e.to))
    const roots = nodes.filter(n => !hasIncoming.has(n.id))
    
    // BFS to assign layers
    const layers: Map<string, number> = new Map()
    const queue: string[] = roots.map(r => r.id)
    
    // Initialize roots at layer 0
    roots.forEach(r => layers.set(r.id, 0))
    
    // Process queue
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      const currentLayer = layers.get(nodeId) || 0
      
      // Find children
      const childEdges = edges.filter(e => e.from === nodeId)
      for (const edge of childEdges) {
        const childLayer = Math.max(layers.get(edge.to) || 0, currentLayer + 1)
        layers.set(edge.to, childLayer)
        if (!queue.includes(edge.to)) {
          queue.push(edge.to)
        }
      }
    }
    
    // Handle orphan nodes (no edges at all)
    nodes.forEach(n => {
      if (!layers.has(n.id)) {
        layers.set(n.id, n.kind === 'source_table' ? 0 : 1)
      }
    })
    
    // Group by layer
    const layerGroups: LineageNode[][] = []
    const maxLayer = Math.max(...Array.from(layers.values()))
    
    for (let i = 0; i <= maxLayer; i++) {
      const layerNodes = nodes.filter(n => layers.get(n.id) === i)
      layerGroups.push(layerNodes)
    }
    
    return { layers, layerGroups, maxLayer }
  }, [nodes, edges])

  // Calculate positions for nodes - increased spacing
  const nodePositions = useMemo(() => {
    const positions: Map<string, { x: number; y: number }> = new Map()
    const containerWidth = 100 // percentage
    const layerHeight = 90 // pixels - increased for more breathing room
    
    layout.layerGroups.forEach((layerNodes, layerIdx) => {
      const nodeWidth = containerWidth / (layerNodes.length + 1)
      
      layerNodes.forEach((node, nodeIdx) => {
        positions.set(node.id, {
          x: nodeWidth * (nodeIdx + 1),
          y: layerIdx * layerHeight + 20,
        })
      })
    })
    
    return positions
  }, [layout])

  const containerHeight = (layout.maxLayer + 1) * 90 + 40

  return (
    <div 
      className="relative" 
      style={{ height: `${Math.min(containerHeight, 300)}px` }}
    >
      {/* Curved Bezier Edges (SVG) */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Gradient for edges */}
          <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--color-node-source-border)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--color-node-derived-border)" stopOpacity="0.6" />
          </linearGradient>
          
          {/* Arrow marker */}
          <marker
            id="arrowhead-flow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <path
              d="M 0 0 L 8 4 L 0 8 Z"
              fill="var(--color-node-derived-border)"
              opacity="0.7"
            />
          </marker>
        </defs>

        {edges.map((edge) => {
          const fromPos = nodePositions.get(edge.from)
          const toPos = nodePositions.get(edge.to)
          
          if (!fromPos || !toPos) return null
          
          // Calculate bezier control points for smooth curve
          const fromY = fromPos.y + 20 // bottom of source node
          const toY = toPos.y - 4 // top of target node
          const midY = (fromY + toY) / 2
          
          // Create smooth bezier path
          const path = `
            M ${fromPos.x}% ${fromY}
            C ${fromPos.x}% ${midY}, 
              ${toPos.x}% ${midY}, 
              ${toPos.x}% ${toY}
          `
          
          return (
            <g key={edge.id}>
              {/* Shadow/glow effect */}
              <path
                d={path}
                fill="none"
                stroke="var(--color-node-derived-border)"
                strokeWidth={4}
                strokeOpacity={0.1}
                strokeLinecap="round"
              />
              {/* Main path */}
              <path
                d={path}
                fill="none"
                stroke="url(#edgeGradient)"
                strokeWidth={2}
                strokeLinecap="round"
                markerEnd="url(#arrowhead-flow)"
                className="transition-all"
              />
            </g>
          )
        })}
      </svg>

      {/* Nodes - larger and more prominent */}
      {nodes.map((node) => {
        const pos = nodePositions.get(node.id)
        if (!pos) return null

        const isSource = node.kind === 'source_table'

        return (
          <button
            key={node.id}
            onClick={() => onNodeClick(node.id)}
            className={`
              absolute transform -translate-x-1/2
              px-4 py-2 rounded-lg border-2 text-sm font-medium
              transition-all duration-200
              hover:scale-110 hover:shadow-lg hover:-translate-y-0.5
              focus:outline-none focus:ring-2 focus:ring-offset-2
              max-w-[140px] truncate
              ${isSource
                ? 'bg-node-source border-node-source-border text-node-source-border hover:bg-white dark:hover:bg-gray-800 focus:ring-node-source-border'
                : 'bg-node-derived border-node-derived-border text-node-derived-border hover:bg-white dark:hover:bg-gray-800 focus:ring-node-derived-border'
              }
            `}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}px`,
            }}
            title={`${node.name} (${node.rowCount.toLocaleString()} rows)`}
          >
            <span className="flex items-center gap-2">
              {/* Table icon */}
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm2 0h14v4H5V5zm0 6h4v8H5v-8zm6 0h8v8h-8v-8z" />
              </svg>
              <span className="truncate">{node.name}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
