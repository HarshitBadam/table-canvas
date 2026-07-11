import { useState } from 'react'
import { useStorageQuota } from './useStorageQuota'
import { formatBytes } from './quotaMonitor'

export function StorageWarningBanner() {
  const quota = useStorageQuota()
  const [dismissed, setDismissed] = useState(false)

  if (!quota?.isNearLimit || dismissed) return null

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500/10 text-amber-700 border-b border-amber-500/20"
      role="status"
      aria-live="polite"
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>
        Storage is {Math.round(quota.percentUsed * 100)}% full
        ({formatBytes(quota.usage)} of {formatBytes(quota.quota)}).
        Consider exporting or removing unused data.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-auto shrink-0 p-1 rounded hover:bg-amber-500/20 text-amber-600"
        aria-label="Dismiss storage warning"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
