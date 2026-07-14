export interface GridFeedbackMessage {
  id?: number
  message: string
  tone?: 'success' | 'warning' | 'error'
  actionLabel?: string
  onAction?: () => void
}

interface GridFeedbackProps {
  feedback: GridFeedbackMessage
  onDismiss: () => void
}

export function GridFeedback({ feedback, onDismiss }: GridFeedbackProps) {
  const toneClass = feedback.tone === 'error'
    ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
    : feedback.tone === 'warning'
      ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
      : 'border-border-elevation bg-surface text-text-primary'

  return (
    <div
      role={feedback.tone === 'error' ? 'alert' : 'status'}
      aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-toast flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-lg sm:left-1/2 sm:right-auto sm:w-auto sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:flex-nowrap lg:bottom-5 ${toneClass}`}
    >
      <span className="min-w-0 text-sm">{feedback.message}</span>
      {feedback.actionLabel && feedback.onAction && (
        <button
          type="button"
          className="btn btn-secondary flex-shrink-0 text-xs"
          onClick={feedback.onAction}
        >
          {feedback.actionLabel}
        </button>
      )}
      <button
        type="button"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-current opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
