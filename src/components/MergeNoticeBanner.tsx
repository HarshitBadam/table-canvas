import { useEffect, useState } from 'react'
import { setProjectMergeHandler, type ProjectMergeEvent } from '@/persistence/syncService'

/** Long enough to read, short enough to stop being clutter. */
const NOTICE_TIMEOUT_MS = 12_000

function describeMerge(event: ProjectMergeEvent): string {
  const details: string[] = []
  if (event.recoveredReportIds.length > 0) {
    details.push(event.recoveredReportIds.length === 1
      ? 'One report was edited in both places, so the other version was kept as a copy.'
      : `${event.recoveredReportIds.length} reports were edited in both places, so the other versions were kept as copies.`)
  }
  if (event.droppedEdgeIds.length > 0) {
    details.push('Some table connections were removed because they no longer fit together.')
  }
  return ['Changes from another device were merged into this project.', ...details].join(' ')
}

export function MergeNoticeBanner() {
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setProjectMergeHandler(event => setNotice(describeMerge(event)))
    return () => setProjectMergeHandler(null)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  if (!notice) return null

  return (
    <div
      className="animate-fade-in flex items-center gap-2 border-b border-border bg-surface-secondary px-4 py-2 text-sm text-text-secondary"
      role="status"
      aria-live="polite"
    >
      <span>{notice}</span>
      <button
        type="button"
        onClick={() => setNotice(null)}
        className="btn btn-ghost ml-auto shrink-0 p-1"
        aria-label="Dismiss merge notice"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
