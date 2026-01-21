/**
 * Data Flow Hero Component
 * 
 * Visual centerpiece showing table relationships with polished aesthetics.
 * Features blueprint grid background, card-style nodes, and smooth bezier connections.
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
            {sourceNodes.length} source{sourceNodes.length !== 1 ? 's' : ''}, {derivedNodes.length} derived
          </span>
        </div>
        
        {/* Inline Legend */}
        <div className="flex items-center gap-4 text-xs text-text-tertiary">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-[#217346]" />
            <span>Source</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-violet-500" />
            <span>Derived</span>
          </div>
        </div>
      </div>

      {/* Visualization with blueprint grid background */}
      <div className="relative">
        {/* Blueprint grid background */}
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
        
        {/* Content */}
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

// Polished lineage visualization with card-style nodes
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

  // Calculate positions for nodes - increased spacing for card style
  const nodePositions = useMemo(() => {
    const positions: Map<string, { x: number; y: number }> = new Map()
    const containerWidth = 100 // percentage
    const layerHeight = 100 // pixels - more room for cards
    
    layout.layerGroups.forEach((layerNodes, layerIdx) => {
      const nodeWidth = containerWidth / (layerNodes.length + 1)
      
      layerNodes.forEach((node, nodeIdx) => {
        positions.set(node.id, {
          x: nodeWidth * (nodeIdx + 1),
          y: layerIdx * layerHeight + 24,
        })
      })
    })
    
    return positions
  }, [layout])

  const containerHeight = (layout.maxLayer + 1) * 100 + 48

  return (
    <div 
      className="relative" 
      style={{ height: `${Math.min(containerHeight, 350)}px` }}
    >
      {/* Curved Bezier Edges (SVG) */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Gradient for edges */}
          <linearGradient id="flowEdgeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#217346" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.5" />
          </linearGradient>
          
          {/* Arrow marker */}
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
          
          // Calculate bezier control points for smooth curve
          const fromY = fromPos.y + 48 // bottom of source card
          const toY = toPos.y - 6 // top of target card
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
              {/* Glow effect */}
              <path
                d={path}
                fill="none"
                stroke="#8B5CF6"
                strokeWidth={6}
                strokeOpacity={0.08}
                strokeLinecap="round"
              />
              {/* Main path */}
              <path
                d={path}
                fill="none"
                stroke="url(#flowEdgeGradient)"
                strokeWidth={2.5}
                strokeLinecap="round"
                markerEnd="url(#flowArrowhead)"
                className="transition-all"
              />
            </g>
          )
        })}
      </svg>

      {/* Card-style Nodes */}
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
              bg-white dark:bg-gray-800
              rounded-xl border-2
              px-4 py-2.5
              transition-all duration-200
              hover:scale-105 hover:-translate-y-1
              focus:outline-none focus:ring-2 focus:ring-offset-2
              group
              ${isSource
                ? 'border-[#217346]/30 hover:border-[#217346] focus:ring-[#217346]'
                : 'border-violet-500/30 hover:border-violet-500 focus:ring-violet-500'
              }
            `}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}px`,
              boxShadow: '0 2px 8px -2px rgba(0,0,0,0.1), 0 4px 16px -4px rgba(0,0,0,0.1)',
              minWidth: '120px',
              maxWidth: '160px',
            }}
            title={`${node.name} (${node.rowCount.toLocaleString()} rows)`}
          >
            {/* Header with icon */}
            <div className="flex items-center gap-2">
              <div className={`
                w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0
                ${isSource 
                  ? 'bg-[#217346] text-white' 
                  : 'bg-violet-500 text-white'
                }
              `}>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm2 0h14v4H5V5zm0 6h4v8H5v-8zm6 0h8v8h-8v-8z" />
                </svg>
              </div>
              <span className={`
                text-sm font-medium truncate
                ${isSource 
                  ? 'text-[#217346] group-hover:text-[#1a5c38]' 
                  : 'text-violet-600 dark:text-violet-400 group-hover:text-violet-700 dark:group-hover:text-violet-300'
                }
              `}>
                {node.name}
              </span>
            </div>
            
            {/* Row count */}
            <div className="text-[11px] text-text-tertiary mt-1 text-left">
              {node.rowCount.toLocaleString()} rows
            </div>
          </button>
        )
      })}
    </div>
  )
}
