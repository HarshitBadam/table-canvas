import { ConnectionLineComponentProps, getSmoothStepPath } from 'reactflow'

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
      <path
        d={path}
        fill="none"
        stroke="rgba(61, 107, 82, 0.3)"
        strokeWidth={20}
        strokeLinecap="round"
        filter="url(#connectionGlow)"
      />
      
      <path
        d={path}
        fill="none"
        stroke="rgba(61, 107, 82, 0.4)"
        strokeWidth={10}
        strokeLinecap="round"
        className="animate-pulse"
      />
      
      <path
        d={path}
        fill="none"
        stroke="#3d6b52"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray="10 6"
        className="connection-line-animated"
      />
      
      <circle
        cx={fromX}
        cy={fromY}
        r={5}
        fill="#3d6b52"
        stroke="white"
        strokeWidth={2}
      />
      
      <circle
        cx={toX}
        cy={toY}
        r={12}
        fill="none"
        stroke="rgba(61, 107, 82, 0.5)"
        strokeWidth={2}
        className="connection-target-ring"
      />
      
      <circle
        cx={toX}
        cy={toY}
        r={7}
        fill="#3d6b52"
        stroke="white"
        strokeWidth={2.5}
        className="animate-pulse"
      />
      
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
