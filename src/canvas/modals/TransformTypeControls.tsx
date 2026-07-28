import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [helpOpen, setHelpOpen] = useState(false)
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!helpOpen) return

    const updatePosition = () => {
      const trigger = helpTriggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const width = Math.min(320, window.innerWidth - 32)
      setTooltipPosition({
        left: Math.min(Math.max(16, rect.left - 8), window.innerWidth - width - 16),
        top: rect.bottom + 10,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [helpOpen])

  return (
    <>
      <section className="join-section">
        <div className="join-section-title">
          <h3>Operation</h3>
          <div className="operation-help">
            <button
              ref={helpTriggerRef}
              type="button"
              className="operation-help-trigger"
              aria-label="How joining and appending work"
              aria-describedby="operation-help-tooltip"
              onMouseEnter={() => setHelpOpen(true)}
              onMouseLeave={() => setHelpOpen(false)}
              onFocus={() => setHelpOpen(true)}
              onBlur={() => setHelpOpen(false)}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
                <circle cx="8" cy="8" r="6.25" strokeWidth="1.5" />
                <path d="M8 7.1v3.5m0-5.1h.01" strokeLinecap="round" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        </div>
        {helpOpen && typeof document !== 'undefined' && createPortal(
          <div
            id="operation-help-tooltip"
            className="operation-help-tooltip"
            role="tooltip"
            style={tooltipPosition}
          >
            <div className="operation-help-item">
              <strong>Join</strong>
              <span>Matches related rows using a shared column, such as an ID or email.</span>
            </div>
            <div className="operation-help-item">
              <strong>Append</strong>
              <span>Stacks one table below another. Append is available when both tables have the same columns, in the same order, with the same data types.</span>
            </div>
          </div>,
          document.body,
        )}
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
            disabled={!canUnion}
            className={`join-type-card ${TYPE_BUTTON_FOCUS} ${operation === 'union' ? ACTIVE_TYPE_BUTTON : ''}`}
          >
            <span className="join-type-name">Append</span>
            <span className="join-type-desc">
              {canUnion ? 'Add one table’s rows after the other' : 'Available when schemas match'}
            </span>
          </button>
        </div>
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
