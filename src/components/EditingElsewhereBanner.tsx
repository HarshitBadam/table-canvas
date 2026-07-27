import { useEffect, useState } from 'react'
import { useWorkspaceLease } from '@/state/useWorkspaceLease'

/** A handover this fast should be invisible, so nothing changes for this long. */
const CLAIM_NOTICE_DELAY_MS = 300

export function EditingElsewhereBanner() {
  const { role, requesting, refused, requestEditing } = useWorkspaceLease()
  const [showClaiming, setShowClaiming] = useState(false)

  useEffect(() => {
    if (!requesting) {
      setShowClaiming(false)
      return
    }
    const timer = setTimeout(() => setShowClaiming(true), CLAIM_NOTICE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [requesting])

  if (refused) {
    return (
      <div
        className="animate-fade-in flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-700"
        role="status"
        aria-live="polite"
      >
        <span>The other tab could not save its changes, so editing stayed there.</span>
        <button
          type="button"
          onClick={requestEditing}
          className="btn btn-primary ml-auto shrink-0 px-2.5 py-1 text-xs"
        >
          Try again
        </button>
      </div>
    )
  }

  if (role !== 'mirror') return null

  return (
    <div
      className="animate-fade-in flex items-center gap-2 border-b border-border bg-surface-secondary px-4 py-2 text-sm text-text-secondary"
      role="status"
      aria-live="polite"
    >
      <span>
        {showClaiming
          ? 'Moving editing to this tab…'
          : 'Viewing live. Editing is active in another tab.'}
      </span>
      <button
        type="button"
        onClick={requestEditing}
        disabled={requesting}
        className="btn btn-primary ml-auto shrink-0 px-2.5 py-1 text-xs"
      >
        Edit here
      </button>
    </div>
  )
}
