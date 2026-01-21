/**
 * Data Flow Section Component
 * 
 * Shows a simplified visual of table relationships with clear legend.
 * Collapsible to reduce visual clutter.
 */

import { useMemo, useState } from 'react'
import type { LineageNode, LineageEdge } from '../useDashboardData'

interface LineageMiniMapProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  onNodeClick: (nodeId: string) => void
}

export function LineageMiniMap({ nodes, edges, onNodeClick }: LineageMiniMapProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Separate source and derived tables
  const sourceNodes = useMemo(() => nodes.filter(n => n.kind === 'source_table'), [nodes])
  const derivedNodes = useMemo(() => nodes.filter(n => n.kind === 'derived_table'), [nodes])

  // Don't render if no meaningful lineage to show
  if (nodes.length === 0 || (derivedNodes.length === 0 && edges.length === 0)) {
    return null
  }

  return (
    <div className="bg-surface rounded-xl border border-border">
      {/* Section Header - Clickable to collapse */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Data Flow</h3>
          <span className="text-xs text-text-tertiary">
            {sourceNodes.length} source{sourceNodes.length !== 1 ? 's' : ''} → {derivedNodes.length} derived
          </span>
        </div>
        <svg 
          className={`w-4 h-4 text-text-tertiary transition-transform ${isCollapsed ? '' : 'rotate-180'}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="border-t border-border">
          {/* Inline Legend */}
          <div className="px-4 py-2 bg-surface-secondary/30 flex items-center gap-4 text-xs text-text-tertiary">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-node-source-border" />
              <span>Source (imported data)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-node-derived-border" />
              <span>Derived (from transforms)</span>
            </div>
          </div>

          {/* Visualization */}
          <div className="p-4">
            <LineageVisualization 
              nodes={nodes}
              edges={edges}
              onNodeClick={onNodeClick}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Simple lineage visualization using CSS grid layout
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

  // Calculate positions for nodes
  const nodePositions = useMemo(() => {
    const positions: Map<string, { x: number; y: number }> = new Map()
    const containerWidth = 100 // percentage
    const layerHeight = 70 // pixels
    
    layout.layerGroups.forEach((layerNodes, layerIdx) => {
      const nodeWidth = containerWidth / (layerNodes.length + 1)
      
      layerNodes.forEach((node, nodeIdx) => {
        positions.set(node.id, {
          x: nodeWidth * (nodeIdx + 1),
          y: layerIdx * layerHeight + 16,
        })
      })
    })
    
    return positions
  }, [layout])

  const containerHeight = (layout.maxLayer + 1) * 70 + 32

  return (
    <div 
      className="relative" 
      style={{ height: `${Math.min(containerHeight, 250)}px` }}
    >
      {/* Edges (SVG) */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        {edges.map((edge) => {
          const fromPos = nodePositions.get(edge.from)
          const toPos = nodePositions.get(edge.to)
          
          if (!fromPos || !toPos) return null
          
          return (
            <line
              key={edge.id}
              x1={`${fromPos.x}%`}
              y1={fromPos.y + 14}
              x2={`${toPos.x}%`}
              y2={toPos.y - 2}
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-border"
              markerEnd="url(#arrowhead)"
            />
          )
        })}
        {/* Arrow marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 6 3, 0 6"
              className="fill-border"
            />
          </marker>
        </defs>
      </svg>

      {/* Nodes */}
      {nodes.map((node) => {
        const pos = nodePositions.get(node.id)
        if (!pos) return null

        return (
          <button
            key={node.id}
            onClick={() => onNodeClick(node.id)}
            className={`
              absolute transform -translate-x-1/2
              px-3 py-1 rounded-lg border text-xs font-medium
              transition-all hover:scale-105 hover:shadow-md
              max-w-[110px] truncate
              ${node.kind === 'source_table'
                ? 'bg-node-source border-node-source-border text-node-source-border hover:bg-node-source/80'
                : 'bg-node-derived border-node-derived-border text-node-derived-border hover:bg-node-derived/80'
              }
            `}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}px`,
            }}
            title={`${node.name} (${node.rowCount.toLocaleString()} rows)`}
          >
            {node.name}
          </button>
        )
      })}
    </div>
  )
}
