import type { JoinType } from '@/types'

type Operation = 'join' | 'union'

const JOIN_TYPES: { value: JoinType; label: string; description: string }[] = [
  { value: 'left', label: 'Left', description: 'All left rows' },
  { value: 'inner', label: 'Inner', description: 'Matching rows only' },
  { value: 'right', label: 'Right', description: 'All right rows' },
  { value: 'full', label: 'Full', description: 'All rows from both' },
]

const TYPE_BUTTON_FOCUS = 'canvas-touch-target'
const ACTIVE_TYPE_BUTTON = 'active !shadow-none'

interface TransformTypeControlsProps {
  operation: Operation
  onOperationChange: (operation: Operation) => void
  canUnion: boolean
  joinType: JoinType
  onJoinTypeChange: (joinType: JoinType) => void
}

export function TransformTypeControls({
  operation,
  onOperationChange,
  canUnion,
  joinType,
  onJoinTypeChange,
}: TransformTypeControlsProps) {
  return (
    <>
      <section className="join-section">
        <h3>Operation</h3>
        <div className="join-types !grid-cols-2">
          <button
            type="button"
            onClick={() => onOperationChange('join')}
            aria-pressed={operation === 'join'}
            className={`join-type-card ${TYPE_BUTTON_FOCUS} ${operation === 'join' ? ACTIVE_TYPE_BUTTON : ''}`}
          >
            <span className="join-type-name">Join</span>
            <span className="join-type-desc">Match rows by column values</span>
          </button>
          <button
            type="button"
            onClick={() => onOperationChange('union')}
            aria-pressed={operation === 'union'}
            className={`join-type-card ${TYPE_BUTTON_FOCUS} ${operation === 'union' ? ACTIVE_TYPE_BUTTON : ''}`}
          >
            <span className="join-type-name">Append</span>
            <span className="join-type-desc">Add one table&apos;s rows after the other</span>
          </button>
        </div>
        {operation === 'union' && !canUnion && (
          <p className="mt-2 text-xs text-red-600" role="alert">
            To append these tables, give them the same number of columns with matching types in the same order.
          </p>
        )}
      </section>

      {operation === 'join' && (
        <section className="join-section">
          <h3>Join Type</h3>
          <div className="join-types max-sm:!grid-cols-2">
            {JOIN_TYPES.map(type => (
              <button
                key={type.value}
                type="button"
                onClick={() => onJoinTypeChange(type.value)}
                aria-pressed={joinType === type.value}
                className={`join-type-card ${TYPE_BUTTON_FOCUS} ${joinType === type.value ? ACTIVE_TYPE_BUTTON : ''}`}
              >
                <span className="join-type-name">{type.label}</span>
                <span className="join-type-desc">{type.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
