import { useEffect } from 'react'
import { useProjectStore } from '../../projectStore'
import { getStorageScope } from '@/persistence/storage/storageScope'
import { markProjectActive } from '@/layout/project-controls/projectActivity'

/**
 * Marks unexported work from the undo stack, not raw node/edge changes (those
 * also fire on every project load). A freshly opened project stays unmarked
 * until the user edits; emptying the stack clears the trigger again.
 */
export function useProjectActivityTracking(): void {
  const projectId = useProjectStore(store => store.projectId)
  const hasHistory = useProjectStore(store => store.history.past.length > 0)

  useEffect(() => {
    if (!projectId || !hasHistory) return
    markProjectActive(getStorageScope(), projectId)
  }, [projectId, hasHistory])
}
