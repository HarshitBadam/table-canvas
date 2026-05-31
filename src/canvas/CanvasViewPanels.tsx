import { Panel } from 'reactflow'
import { ImportButton } from '@/components/ImportButton'
import type { LayoutDirection } from './autoLayout'

interface AutoArrangePanelProps {
  onArrange: (direction: LayoutDirection) => void
}

export function CanvasAutoArrangePanel({ onArrange }: AutoArrangePanelProps) {
  return (
    <Panel position="bottom-left" className="ml-3 mb-3">
      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg shadow-md p-1">
        <button
          onClick={() => onArrange('LR')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-accent-green hover:bg-surface-secondary rounded-md transition-colors"
          title="Auto-arrange nodes"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          Auto-Arrange
        </button>
        <div className="w-px h-5 bg-border" />
        <button
          onClick={() => onArrange('TB')}
          className="p-1.5 text-text-tertiary hover:text-accent-green hover:bg-surface-secondary rounded-md transition-colors"
          title="Arrange vertically (top to bottom)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0 0l-6-6m6 6l6-6" />
          </svg>
        </button>
        <button
          onClick={() => onArrange('LR')}
          className="p-1.5 text-text-tertiary hover:text-accent-green hover:bg-surface-secondary rounded-md transition-colors"
          title="Arrange horizontally (left to right)"
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
    <Panel position="top-center" className="mt-16">
      <div className="text-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-green-200/50 dark:border-green-800/30 p-12 max-w-lg relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-green-400/20 to-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-gradient-to-tr from-emerald-400/20 to-green-500/20 rounded-full blur-3xl" />

        <div className="relative">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-3">
            Welcome to Table Canvas
          </h2>
          <p className="text-sm text-text-secondary mb-8 max-w-sm mx-auto leading-relaxed">
            Create powerful data workflows by importing files, transforming data, and building visualizations.
          </p>
          <div className="flex gap-4 justify-center">
            <div className="w-40">
              <ImportButton />
            </div>
            <button
              className="btn btn-secondary px-6 shadow-sm"
              onClick={onNewTable}
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Table
            </button>
          </div>
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
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/90 border border-amber-200 dark:border-amber-700 rounded-xl shadow-lg max-w-md">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Circular Dependency Blocked
          </h4>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            {warning}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
