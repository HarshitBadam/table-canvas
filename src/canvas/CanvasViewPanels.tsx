import { useEffect, useRef } from 'react'
import { Panel } from 'reactflow'
import { ImportButton } from '@/components/ImportButton'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/useWorkspaceLease'
import type { LayoutDirection } from './autoLayout'

interface AutoArrangePanelProps {
  onArrange: (direction: LayoutDirection) => void
}

export function CanvasAutoArrangePanel({ onArrange }: AutoArrangePanelProps) {
  const { canEdit } = useWorkspaceLease()
  return (
    <Panel position="top-left" className="!z-sticky ml-3 mt-3">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-md">
        <span className="px-2 text-xs font-medium text-text-secondary">Arrange tables</span>
        <div className="h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => onArrange('TB')}
          disabled={!canEdit}
          className="canvas-touch-target rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-accent-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-tertiary"
          title={canEdit ? 'Arrange tables top to bottom' : EDITING_ELSEWHERE_TOOLTIP}
          aria-label="Arrange tables top to bottom"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-6-6m6 6l6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onArrange('LR')}
          disabled={!canEdit}
          className="canvas-touch-target rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-accent-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-tertiary"
          title={canEdit ? 'Arrange tables left to right' : EDITING_ELSEWHERE_TOOLTIP}
          aria-label="Arrange tables left to right"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16m0 0l-6-6m6 6l-6 6" />
          </svg>
        </button>
      </div>
    </Panel>
  )
}

interface EmptyStateProps {
  onNewTable: () => void
}

export function CanvasEmptyState({ onNewTable }: EmptyStateProps) {
  const { canEdit } = useWorkspaceLease()
  return (
    <Panel position="top-center" className="mt-12 max-w-[calc(100vw-2rem)] sm:mt-16">
      <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-md sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-green">
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-text-primary">
          Start with a table
        </h2>
        <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-text-secondary">
          Import a spreadsheet or create a blank table. Then connect tables to build a repeatable transformation.
        </p>
        <div className="flex flex-col justify-center gap-2 lg:flex-row lg:items-center">
          <div className="w-full lg:w-40">
            <ImportButton />
          </div>
          <button
            type="button"
            className="btn btn-secondary w-full gap-2 whitespace-nowrap lg:w-40"
            onClick={onNewTable}
            disabled={!canEdit}
            title={canEdit ? undefined : EDITING_ELSEWHERE_TOOLTIP}
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Table
          </button>
        </div>
      </div>
    </Panel>
  )
}

interface CycleWarningToastProps {
  warning: string | null
  onClose: () => void
}

export function CycleWarningToast({ warning, onClose }: CycleWarningToastProps) {
  const toastRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!warning) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!toastRef.current?.contains(event.target as globalThis.Node)) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [warning, onClose])

  if (!warning) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
      <div
        ref={toastRef}
        className="max-w-md rounded-2xl bg-surface px-5 py-4 shadow-xl"
        role="alert"
      >
        <p className="text-[13px] font-medium leading-snug text-text-secondary">{warning}</p>
      </div>
    </div>
  )
}
