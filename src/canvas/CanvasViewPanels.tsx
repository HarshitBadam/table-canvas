import { Panel } from 'reactflow'
import { ImportButton } from '@/components/ImportButton'
import type { LayoutDirection } from './autoLayout'

interface AutoArrangePanelProps {
  onArrange: (direction: LayoutDirection) => void
}

export function CanvasAutoArrangePanel({ onArrange }: AutoArrangePanelProps) {
  return (
    <Panel position="bottom-left" className="ml-3 mb-3">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-md">
        <span className="px-2 text-xs font-medium text-text-secondary">Arrange</span>
        <div className="h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => onArrange('TB')}
          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-accent-green"
          title="Arrange vertically (top to bottom)"
          aria-label="Arrange vertically"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-6-6m6 6l6-6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onArrange('LR')}
          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-accent-green"
          title="Arrange horizontally (left to right)"
          aria-label="Arrange horizontally"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          Import a file or create a table, then connect transformations on the canvas.
        </p>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <div className="sm:w-40">
            <ImportButton />
          </div>
          <button
            type="button"
            className="btn btn-secondary px-6"
            onClick={onNewTable}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
  if (!warning) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div
        className="flex items-start gap-3 px-4 py-3 bg-surface border border-warning/40 rounded-xl shadow-lg max-w-md"
        role="alert"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center">
          <svg className="w-5 h-5 text-warning-text" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="flex-1 text-sm text-text-primary">{warning}</p>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="Dismiss connection warning"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
