/**
 * Canvas Feature Barrel Export
 * 
 * Re-exports all canvas-related components and utilities.
 */

// Main component
export { CanvasView } from '@/canvas/CanvasView'

// Node components
export { TableNodeComponent } from '@/canvas/nodes/TableNode'
export { ChartNodeComponent } from '@/canvas/nodes/ChartNode'
export { MiniTableView } from '@/canvas/nodes/MiniTableView'

// Modals
export { TransformModal } from '@/canvas/modals/TransformModal'
export { NewTableModal } from '@/canvas/modals/NewTableModal'

// Utilities
export { computeSmartEdges } from '@/canvas/edgeRouter'
export type { SmartEdge } from '@/canvas/edgeRouter'
export { CustomConnectionLine } from '@/canvas/ConnectionLine'
export { getLayoutedNodes } from '@/canvas/autoLayout'
export type { LayoutDirection } from '@/canvas/autoLayout'
