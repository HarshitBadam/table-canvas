import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { fetchProjects } from '@/persistence/syncService'
import { getStorageScope } from '@/persistence/storageScope'
import {
  bindProjectCatalog,
  subscribeProjectCatalog,
  type ProjectCatalogEvent,
} from '@/persistence/projectCatalog'
import { useProjectStore } from './projectStore'
import type { AppPhase, AppProviderState } from './appContextValue'

interface Options {
  isAuthenticated: boolean
  phase: AppPhase
  engineReady: boolean
  initialized: MutableRefObject<boolean>
  clearActiveWorkspace: () => Promise<void>
  setState: Dispatch<SetStateAction<AppProviderState>>
  userId: string | undefined
}

/**
 * Keeps the in-memory project list aligned with IndexedDB / cross-tab catalog
 * events once boot has finished loading a project.
 */
export function useProjectCatalogReconcile({
  isAuthenticated,
  phase,
  engineReady,
  initialized,
  clearActiveWorkspace,
  setState,
  userId,
}: Options): void {
  useEffect(() => {
    // Wait until boot/login has finished loading a project. Running reconcile
    // while phase is still briefly 'ready' before postLoginSetup flips it to
    // loading_project races getDB() against the login path.
    if (!isAuthenticated || phase !== 'ready' || !initialized.current) return
    // Skip the first ready paint that happens before initialize() finishes —
    // initialize sets ready only after the first project load.
    if (!engineReady) return
    const scope = getStorageScope()
    const stopBinding = bindProjectCatalog(scope)
    let stopped = false
    let generation = 0

    const reconcileCatalog = async (event?: ProjectCatalogEvent) => {
      const requestGeneration = ++generation
      try {
        const projects = await fetchProjects()
        if (stopped || requestGeneration !== generation) return
        const storeProjectId = useProjectStore.getState().projectId
        const activeProjectId = storeProjectId || null
        const deletedActive = Boolean(
          activeProjectId
          && (
            (event?.type === 'project-deleted' && event.projectId === activeProjectId)
            || !projects.some(project => project.id === activeProjectId)
          ),
        )
        if (deletedActive) {
          setState(previous => ({
            ...previous,
            projectId: null,
            projectName: 'Untitled Project',
            projects,
            isProjectOperationPending: true,
            syncError: 'This project was deleted in another tab.',
          }))
          await clearActiveWorkspace()
          if (stopped || requestGeneration !== generation) return
          setState(previous => ({
            ...previous,
            projectId: null,
            projectName: 'Untitled Project',
            projects,
            isProjectOperationPending: false,
          }))
          return
        }
        setState(previous => ({ ...previous, projects }))
      } catch (error) {
        console.error('[AppContext] Failed to reconcile the project catalog:', error)
      }
    }

    const unsubscribe = subscribeProjectCatalog(event => {
      void reconcileCatalog(event)
    })
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void reconcileCatalog()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      stopped = true
      generation += 1
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      unsubscribe()
      stopBinding()
    }
  }, [
    clearActiveWorkspace,
    engineReady,
    initialized,
    isAuthenticated,
    phase,
    setState,
    userId,
  ])
}
