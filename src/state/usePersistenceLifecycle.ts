import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  fetchProjects,
  flushAllProjectSavesWithSync,
  loadProjectWithSync,
  syncLocalProjectsToBackend,
} from '@/persistence/syncService'
import { useReportStore } from '@/report/reportStore'
import type { User } from '@/api/auth.api'
import type { ProjectWithSync } from '@/persistence/projectSync'
import { useProjectStore } from './projectStore'
import { setBeforeTabRelease } from './tabOwnership'
import type { AppProviderState } from './appContextValue'

interface PersistenceLifecycleOptions {
  user: User | null
  flushProjectSave: () => Promise<void>
  saveLatestProject: () => Promise<void>
  prepareProject: (project: ProjectWithSync) => Promise<void>
  setState: Dispatch<SetStateAction<AppProviderState>>
}

export function usePersistenceLifecycle({
  user,
  flushProjectSave,
  saveLatestProject,
  prepareProject,
  setState,
}: PersistenceLifecycleOptions): void {
  useEffect(() => {
    setBeforeTabRelease(async () => {
      await flushProjectSave()
      await useReportStore.getState().flushSaves()
    })
    return () => setBeforeTabRelease(null)
  }, [flushProjectSave])

  useEffect(() => {
    const persistBeforeSuspension = () => {
      if (document.visibilityState !== 'hidden') return
      void saveLatestProject().catch(error => {
        console.error('[AppContext] Page suspension save failed:', error)
      })
      void useReportStore.getState().flushSaves().catch(error => {
        console.error('[AppContext] Page suspension report save failed:', error)
      })
    }
    document.addEventListener('visibilitychange', persistBeforeSuspension)
    return () => document.removeEventListener('visibilitychange', persistBeforeSuspension)
  }, [saveLatestProject])

  useEffect(() => {
    if (!user || user.tier === 'guest') return
    const handleOnline = () => {
      void synchronizeAfterReconnect({
        saveLatestProject,
        prepareProject,
        setState,
      })
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [prepareProject, saveLatestProject, setState, user])
}

async function synchronizeAfterReconnect({
  saveLatestProject,
  prepareProject,
  setState,
}: Omit<PersistenceLifecycleOptions, 'user' | 'flushProjectSave'>): Promise<void> {
  try {
    await saveLatestProject()
    await useReportStore.getState().flushSaves()
    const activeId = useProjectStore.getState().projectId
    const promotions = await syncLocalProjectsToBackend()
    await flushAllProjectSavesWithSync()
    const activePromotion = promotions.find(
      promotion => promotion.sourceProjectId === activeId,
    )
    let activeProjectName: string | undefined
    if (activePromotion) {
      const promoted = await loadProjectWithSync(
        activePromotion.destinationProjectId,
      )
      if (promoted) {
        await prepareProject(promoted)
        activeProjectName = promoted.name
      }
    }
    const projects = await fetchProjects()
    setState(previous => ({
      ...previous,
      projectId: activePromotion?.destinationProjectId ?? previous.projectId,
      projectName: activeProjectName ?? previous.projectName,
      projects,
    }))
  } catch (error) {
    console.error('[AppContext] Reconnect sync failed:', error)
    setState(previous => ({
      ...previous,
      syncError: error instanceof Error ? error.message : 'Reconnect sync failed',
    }))
  }
}
