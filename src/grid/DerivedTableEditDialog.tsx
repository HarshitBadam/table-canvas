import { useEffect, useRef, useState } from 'react'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { useNavigation } from '@/layout/NavigationContext'
import { duplicateDerivedTable } from '@/state/duplicateDerivedTable'
import { useAppAuth } from '@/state/AppContext'
import type { LimitExceeded } from '@/shared/enforce'

interface DerivedTableEditDialogProps {
  isOpen: boolean
  tableId: string
  onClose: () => void
}

export function DerivedTableEditDialog({
  isOpen,
  tableId,
  onClose,
}: DerivedTableEditDialogProps) {
  const { user } = useAppAuth()
  const { openTable } = useNavigation()
  const duplicateInFlight = useRef(false)
  const promptRef = useRef<HTMLElement>(null)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limitViolation, setLimitViolation] = useState<LimitExceeded | null>(null)

  useEffect(() => {
    if (isOpen) return
    setError(null)
    setLimitViolation(null)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (
        !isDuplicating
        && event.target instanceof Node
        && !promptRef.current?.contains(event.target)
      ) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isDuplicating, isOpen, onClose])

  const handleDuplicate = async () => {
    if (duplicateInFlight.current) return

    duplicateInFlight.current = true
    setIsDuplicating(true)
    setError(null)
    try {
      const result = await duplicateDerivedTable(tableId, user?.tier ?? 'guest')
      if (result.ok) {
        onClose()
        openTable(result.tableId)
        return
      }
      if (result.code === 'LIMIT_EXCEEDED') {
        setLimitViolation(result.violation)
        return
      }
      setError(result.error)
    } finally {
      duplicateInFlight.current = false
      setIsDuplicating(false)
    }
  }

  return (
    <>
      {isOpen && (
        <section
          ref={promptRef}
          role={error ? 'alert' : 'status'}
          aria-live={error ? 'assertive' : 'polite'}
          aria-atomic="true"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-toast w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 lg:bottom-5"
        >
          <div className="relative flex items-center gap-4 rounded-lg bg-surface px-5 py-4 shadow-lg motion-safe:animate-slide-up">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-text-primary">
                This table is view-only
              </h2>
              <p className="mt-1 text-sm leading-5 text-text-secondary">
                Duplicate it to create an editable source table.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleDuplicate()}
              disabled={isDuplicating}
              className="shrink-0 rounded-lg bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-surface-tertiary disabled:opacity-50"
            >
              {isDuplicating ? 'Duplicating…' : 'Duplicate'}
            </button>
            {error && (
              <p className="absolute inset-x-0 bottom-full mb-2 rounded-lg bg-error-soft px-3 py-2 text-sm text-error-text shadow-sm">
                {error}
              </p>
            )}
          </div>
        </section>
      )}

      <UpgradePrompt
        open={limitViolation !== null}
        onOpenChange={open => {
          if (!open) setLimitViolation(null)
        }}
        violation={limitViolation}
        layer="nested"
      />
    </>
  )
}
