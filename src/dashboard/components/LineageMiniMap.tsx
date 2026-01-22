/**
 * Lineage Mini Map Component
 * 
 * Shows a simplified visual of table relationships.
 */

import { useMemo } from 'react'
import type { LineageNode, LineageEdge } from '../useDashboardData'

interface LineageMiniMapProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  onNodeClick: (nodeId: string) => void
}

export function LineageMiniMap({ nodes, edges, onNodeClick }: LineageMiniMapProps) {
  // Don't render if no nodes or only 1 node with no edges
  if (nodes.length === 0 || (nodes.length === 1 && edges.length === 0)) {
    return null
  }

  // Separate source and derived tables
  const sourceNodes = useMemo(() => nodes.filter(n => n.kind === 'source_table'), [nodes])
  const derivedNodes = useMemo(() => nodes.filter(n => n.kind === 'derived_table'), [nodes])

  // Only show lineage map if there are actual relationships
  if (derivedNodes.length === 0 && edges.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Data Lineage</h3>
        <span className="text-xs text-text-tertiary">
          {sourceNodes.length} source{sourceNodes.length !== 1 ? 's' : ''} 
          {derivedNodes.length > 0 && ` → ${derivedNodes.length} derived`}
        </span>
      </div>
      
      <div className="bg-surface rounded-xl border border-border p-4 overflow-hidden">
        <LineageVisualization 
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
        />
        
        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-node-source-border" />
            <span className="text-xs text-text-tertiary">Source Table</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-node-derived-border" />
            <span className="text-xs text-text-tertiary">Derived Table</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-border" />
            <span className="text-xs text-text-tertiary">Transform</span>
          </div>
        </div>
      </div>
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
    const layerHeight = 80 // pixels
    
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

  const containerHeight = (layout.maxLayer + 1) * 80 + 40

  return (
    <div 
      className="relative" 
      style={{ height: `${Math.min(containerHeight, 300)}px` }}
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
          
          // Convert percentages to actual positions
          // We'll use a viewBox trick to make this work
          return (
            <line
              key={edge.id}
              x1={`${fromPos.x}%`}
              y1={fromPos.y + 16}
              x2={`${toPos.x}%`}
              y2={toPos.y}
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
              px-3 py-1.5 rounded-lg border text-xs font-medium
              transition-all hover:scale-105 hover:shadow-md
              max-w-[120px] truncate
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
