import { useEffect } from 'react'
import { useProjectStore } from './projectStore'
import { getStorageScope } from '@/persistence/storageScope'
import { markProjectActive } from '@/layout/projectActivity'

/**
 * Flags the active project as holding unexported work the moment it gains
 * anything to undo. Keying off the undo stack — rather than raw node/edge
 * changes, which also fire on every project load — means a freshly created,
 * imported, or just-opened project is never flagged until the user actually
 * does something with it. Undoing back to an empty stack correctly drops the
 * flag's trigger too, since the project is once again identical to its
 * starting point.
 */
export function useProjectActivityTracking(): void {
  const projectId = useProjectStore(store => store.projectId)
  const hasHistory = useProjectStore(store => store.history.past.length > 0)

  useEffect(() => {
    if (!projectId || !hasHistory) return
    markProjectActive(getStorageScope(), projectId)
  }, [projectId, hasHistory])
}
