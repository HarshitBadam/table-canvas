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
import {
  getActiveProjectGeneration,
  serializeProjectOperation,
} from './projectOperationSerializer'

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

/**
 * Coalesces overlapping reconnect runs locally (a burst of 'online' events performs
 * its network I/O in order) without ever routing that I/O through the shared
 * project-action serializer — a slow reconnect must not block project switches
 * for minutes. Only the final prepare/state commit takes the serializer, and it
 * re-verifies the active project first: a user switch always wins.
 */
let reconnectTail: Promise<void> = Promise.resolve()

export async function synchronizeAfterReconnect(
  reconnectOptions: Omit<PersistenceLifecycleOptions, 'user'>,
): Promise<void> {
  const run = reconnectTail.then(
    () => runReconnectSync(reconnectOptions),
    () => runReconnectSync(reconnectOptions),
  )
  reconnectTail = run.then(() => undefined, () => undefined)
  return run
}

async function runReconnectSync({
  saveLatestProject,
  prepareProject,
  setState,
}: Omit<PersistenceLifecycleOptions, 'user'>): Promise<void> {
  const capturedId = useProjectStore.getState().projectId
  const capturedGeneration = getActiveProjectGeneration()
  try {
    await saveLatestProject()
    await useReportStore.getState().flushSaves()
    const promotions = await syncOfflineAccountProjects()
    const conflicts = await flushAllProjectSavesWithSync()
    const activePromotion = promotions.find(
      promotion => promotion.sourceProjectId === capturedId,
    )
    let promoted: ProjectWithSync | null = null
    let recovered: ProjectWithSync | null = null
    if (activePromotion) {
      promoted = (await loadProjectWithSync(activePromotion.destinationProjectId)) ?? null
    } else if (
      capturedId
      && conflicts.some(conflict => conflict.projectId === capturedId)
    ) {
      recovered = (await loadProjectWithSync(capturedId)) ?? null
    }
    const projects = await fetchProjects()

    await serializeProjectOperation(async () => {
      // The active project may have changed while this reconnect awaited the
      // network above. Only commit prepare/state if nothing moved on; a user
      // switch that happened meanwhile always wins over this stale result.
      const stillCurrent = useProjectStore.getState().projectId === capturedId
        && getActiveProjectGeneration() === capturedGeneration
      let activeProjectName: string | undefined
      if (stillCurrent && promoted) {
        await prepareProject(promoted)
        activeProjectName = promoted.name
      } else if (stillCurrent && recovered) {
        await prepareProject(recovered)
        activeProjectName = recovered.name
      }
      setState(previous => ({
        ...previous,
        projectId: stillCurrent
          ? (activePromotion?.destinationProjectId ?? previous.projectId)
          : previous.projectId,
        projectName: stillCurrent
          ? (activeProjectName ?? previous.projectName)
          : previous.projectName,
        projects: projects.length === 0 && previous.projects.length > 0
          ? previous.projects
          : projects,
      }))
    })
  } catch (error) {
    console.error('[AppContext] Reconnect sync failed:', error)
    setState(previous => ({
      ...previous,
      syncError: error instanceof Error ? error.message : 'Reconnect sync failed',
    }))
  }
}
