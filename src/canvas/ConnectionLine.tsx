import { ConnectionLineComponentProps, getSmoothStepPath } from 'reactflow'

/**
 * Custom connection line component that provides clear visual feedback
 * when dragging a new connection from a node handle.
 * 
 * Features:
 * - Animated dashed line
 * - Glowing effect for visibility
 * - Pulsing target indicator
 * - Smooth step path for clean routing
 */
export function CustomConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) {
  // Use smooth step path for consistent look with edges
  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    borderRadius: 12,
    offset: 35,
  })

  return (
    <g className="react-flow__connection">
      {/* Outer glow layer - large blur for ambient effect */}
      <path
        d={path}
        fill="none"
        stroke="rgba(33, 115, 70, 0.15)"
        strokeWidth={20}
        strokeLinecap="round"
        filter="url(#connectionGlow)"
      />
      
      {/* Middle glow layer */}
      <path
        d={path}
        fill="none"
        stroke="rgba(33, 115, 70, 0.25)"
        strokeWidth={10}
        strokeLinecap="round"
        className="animate-pulse"
      />
      
      {/* Main connection line - animated dash */}
      <path
        d={path}
        fill="none"
        stroke="#217346"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray="10 6"
        className="connection-line-animated"
      />
      
      {/* Source indicator - small dot at start */}
      <circle
        cx={fromX}
        cy={fromY}
        r={5}
        fill="#217346"
        stroke="white"
        strokeWidth={2}
      />
      
      {/* Target indicator - pulsing ring at cursor */}
      <circle
        cx={toX}
        cy={toY}
        r={12}
        fill="none"
        stroke="rgba(33, 115, 70, 0.4)"
        strokeWidth={2}
        className="connection-target-ring"
      />
      
      {/* Target indicator - inner filled circle */}
      <circle
        cx={toX}
        cy={toY}
        r={7}
        fill="#217346"
        stroke="white"
        strokeWidth={2.5}
        className="animate-pulse"
      />
      
      {/* SVG Filter for glow effect */}
      <defs>
        <filter id="connectionGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </g>
  )
}
