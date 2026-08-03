import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { fetchProjects } from '@/persistence/sync/session/syncService'
import { getStorageScope } from '@/persistence/storage/storageScope'
import {
  bindProjectCatalog,
  subscribeProjectCatalog,
  type ProjectCatalogEvent,
} from '@/persistence/sync/project/projectCatalog'
import { useProjectStore } from '../../projectStore'
import type { AppPhase, AppProviderState } from '../appContextValue'

interface Options {
  isAuthenticated: boolean
  phase: AppPhase
  engineReady: boolean
  initialized: MutableRefObject<boolean>
  clearActiveWorkspace: () => Promise<void>
  setState: Dispatch<SetStateAction<AppProviderState>>
  userId: string | undefined
}

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
    // Reconcile only after boot/login finished loading. A brief 'ready' window
    // before postLoginSetup flips to loading_project races getDB() against login.
    if (!isAuthenticated || phase !== 'ready' || !initialized.current) return
    // Skip the first ready paint before initialize() finishes; initialize sets
    // ready only after the first project load.
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
