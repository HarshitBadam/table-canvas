import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  fetchProjects,
  flushAllProjectSavesWithSync,
  loadProjectWithSync,
  syncOfflineAccountProjects,
} from '@/persistence/sync/session/syncService'
import { useReportStore } from '@/report/reportStore'
import type { User } from '@/api/auth.api'
import type { ProjectWithSync } from '@/persistence/sync/project/projectSync'
import { useProjectStore } from '../../projectStore'
import type { AppProviderState } from '../appContextValue'

interface PersistenceLifecycleOptions {
  user: User | null
  saveLatestProject: () => Promise<void>
  prepareProject: (project: ProjectWithSync) => Promise<void>
  setState: Dispatch<SetStateAction<AppProviderState>>
}

export function usePersistenceLifecycle({
  user,
  saveLatestProject,
  prepareProject,
  setState,
}: PersistenceLifecycleOptions): void {
  useEffect(() => {
    const persist = () => {
      void saveLatestProject().catch(error => {
        console.error('[AppContext] Page suspension save failed:', error)
      })
      void useReportStore.getState().flushSaves().catch(error => {
        console.error('[AppContext] Page suspension report save failed:', error)
      })
    }
    const persistWhenHidden = () => {
      if (document.visibilityState !== 'hidden') return
      persist()
    }
    document.addEventListener('visibilitychange', persistWhenHidden)
    window.addEventListener('pagehide', persist)
    return () => {
      document.removeEventListener('visibilitychange', persistWhenHidden)
      window.removeEventListener('pagehide', persist)
    }
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

export async function synchronizeAfterReconnect({
  saveLatestProject,
  prepareProject,
  setState,
}: Omit<PersistenceLifecycleOptions, 'user'>): Promise<void> {
  try {
    await saveLatestProject()
    await useReportStore.getState().flushSaves()
    const activeId = useProjectStore.getState().projectId
    const promotions = await syncOfflineAccountProjects()
    const conflicts = await flushAllProjectSavesWithSync()
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
    } else if (
      activeId
      && conflicts.some(conflict => conflict.projectId === activeId)
    ) {
      const recovered = await loadProjectWithSync(activeId)
      if (recovered) {
        await prepareProject(recovered)
        activeProjectName = recovered.name
      }
    }
    const projects = await fetchProjects()
    setState(previous => ({
      ...previous,
      projectId: activePromotion?.destinationProjectId ?? previous.projectId,
      projectName: activeProjectName ?? previous.projectName,
      projects: projects.length === 0 && previous.projects.length > 0
        ? previous.projects
        : projects,
    }))
  } catch (error) {
    console.error('[AppContext] Reconnect sync failed:', error)
    setState(previous => ({
      ...previous,
      syncError: error instanceof Error ? error.message : 'Reconnect sync failed',
    }))
  }
}
