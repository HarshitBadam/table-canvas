import {
  getProject, listProjects, type ProjectSummary,
} from '@/api/projects.api'
import { ApiError } from '@/api/client'
import type { Edge, Patches, ProjectNode } from '@/types'
import {
  listProjects as listProjectsLocal, loadProject as loadProjectLocal,
  saveProject as saveProjectLocal,
} from './db'
import { deserializePatches } from './patchSerialization'
import { isNetworkOnline } from './syncState'
import { withoutTransientComputeState } from '@/state/transientProjectState'
import {
  createRemoteProject, isRetryableRemoteDeferral,
} from './projectCreateReconciliation'
import { deleteUnreferencedLocalFiles } from './fileGarbageCollection'
import {
  flushAllProjectSavesWithSync, flushProjectSaveWithSync, reportProjectSyncError,
} from './projectSaveSync'
import {
  getStorageScope,
  isCloudStorageScope,
} from './storageScope'
import type { Report } from '@/report/types'
import {
  copyReportsToProject, replaceReportsForProject,
} from './reportStorage'
import {
  clearProjectSyncOperation,
  enqueueProjectDelete,
  getProjectSyncOperation,
  listProjectSyncOperations,
} from './projectSyncQueue'
export {
  isRetryableRemoteDeferral,
} from './projectCreateReconciliation'
export { syncLocalProjectsToBackend } from './localProjectPromotion'
export { importProjectWithSync } from './projectImportSync'
export {
  flushAllProjectSavesWithSync, flushProjectSaveWithSync, saveProjectWithSync,
  setProjectSyncErrorHandler,
} from './projectSaveSync'

export interface ProjectWithSync {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  isLocalOnly?: boolean
  needsSync?: boolean
  revision?: number
  reports?: Record<string, Report>
}

function fromRemote(project: Awaited<ReturnType<typeof getProject>>): ProjectWithSync {
  const revision = project.revision ?? 0
  return {
    id: project.id,
    name: project.name,
    nodes: withoutTransientComputeState(project.nodes),
    edges: project.edges,
    patches: deserializePatches(project.patches),
    isLocalOnly: false,
    needsSync: false,
    revision,
    reports: project.reports ?? {},
  }
}

function toTimestamp(value: Date | string | undefined): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  if (isNetworkOnline() && isCloudStorageScope()) {
    try {
      const [remoteProjects, localProjects, operations] = await Promise.all([
        listProjects(),
        listProjectsLocal(),
        listProjectSyncOperations(),
      ])
      const localById = new Map(localProjects.map(project => [project.id, project]))
      const operationById = new Map(operations.map(operation => [
        operation.projectId,
        operation,
      ]))
      const merged = remoteProjects.flatMap((remote) => {
        const operation = operationById.get(remote.id)
        if (operation?.operation === 'delete') return []
        const local = localById.get(remote.id)
        if (!local || operation?.operation !== 'save') return [remote]
        return [{
          ...remote,
          name: local.name,
          updatedAt: new Date(local.updatedAt),
        }]
      })
      for (const local of localProjects) {
        const operation = operationById.get(local.id)
        if (
          !local.id.startsWith('local_')
          && operation?.operation !== 'save'
        ) continue
        if (operation?.operation === 'delete') continue
        if (merged.some(project => project.id === local.id)) continue
        merged.push({
          id: local.id,
          name: local.name,
          updatedAt: new Date(local.updatedAt),
          createdAt: new Date(local.updatedAt),
        })
      }
      return merged.sort(
        (a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt),
      )
    } catch (error) {
      console.error('[syncService] Failed to fetch projects from backend:', error)
      if (!isRetryableRemoteDeferral(error)) throw error
    }
  }
  return (await listProjectsLocal()).map(project => ({
    id: project.id,
    name: project.name,
    updatedAt: new Date(project.updatedAt),
    createdAt: new Date(project.updatedAt),
  }))
}

export async function loadProjectWithSync(projectId: string): Promise<ProjectWithSync | null> {
  const scope = getStorageScope()
  const localProject = await loadProjectLocal(projectId)
  const pending = await getProjectSyncOperation(projectId, scope)
  if (pending?.operation === 'delete') {
    if (isNetworkOnline() && isCloudStorageScope()) {
      try {
        await flushProjectSaveWithSync(projectId, scope)
      } catch (error) {
        if (!isRetryableRemoteDeferral(error)) throw error
      }
    }
    return null
  }
  if (projectId.startsWith('local_')) {
    if (!localProject) return null
    return {
      ...localProject,
      patches: deserializePatches(localProject.patches),
      isLocalOnly: true,
      needsSync: true,
      revision: localProject.revision ?? 0,
    }
  }

  if (isNetworkOnline() && isCloudStorageScope()) {
    try {
      let remoteProject = await getProject(projectId)
      if (pending?.operation === 'save' && localProject) {
        if (pending.expectedRevision < (remoteProject.revision ?? 0)) {
          await preserveConflictCopy(
            projectId,
            localProject,
            scope,
            pending.payload?.reports,
          )
        } else {
          try {
            await flushProjectSaveWithSync(projectId, scope)
            const synced = await loadProjectLocal(projectId, scope)
            if (synced) {
              return {
                ...synced,
                patches: deserializePatches(synced.patches),
                isLocalOnly: false,
                needsSync: false,
                revision: synced.revision ?? remoteProject.revision ?? 0,
              }
            }
          } catch (error) {
            if (error instanceof ApiError && error.statusCode === 409) {
              remoteProject = await getProject(projectId)
              await preserveConflictCopy(
                projectId,
                localProject,
                scope,
                pending.payload?.reports,
              )
            } else if (isRetryableRemoteDeferral(error)) {
              return {
                ...localProject,
                patches: deserializePatches(localProject.patches),
                isLocalOnly: false,
                needsSync: true,
                revision: localProject.revision ?? 0,
              }
            } else {
              throw error
            }
          }
        }
      }

      const loaded = fromRemote(remoteProject)
      await saveProjectLocal(
        loaded.id,
        loaded.name,
        loaded.nodes,
        loaded.edges,
        loaded.patches,
        {
          createdAt: remoteProject.createdAt,
          updatedAt: remoteProject.updatedAt,
          revision: remoteProject.revision,
        },
      )
      await replaceReportsForProject(
        loaded.id,
        remoteProject.reports ?? {},
      )
      return loaded
    } catch (error) {
      console.error('[syncService] Failed to load project from backend:', error)
      if (!isRetryableRemoteDeferral(error)) throw error
    }
  }
  if (!localProject) return null
  const fallback = {
    ...localProject,
    patches: deserializePatches(localProject.patches),
    isLocalOnly: !isNetworkOnline() || !isCloudStorageScope(),
    needsSync: pending?.operation === 'save',
    revision: localProject.revision ?? 0,
  }
  return fallback
}

async function preserveConflictCopy(
  projectId: string,
  localProject: NonNullable<Awaited<ReturnType<typeof loadProjectLocal>>>,
  scope: string,
  queuedReports?: Record<string, Report>,
): Promise<void> {
  const recoveryId = createLocalId('local')
  await saveProjectLocal(
    recoveryId,
    `${localProject.name} (conflict copy)`,
    localProject.nodes,
    localProject.edges,
    deserializePatches(localProject.patches),
    { revision: 0 },
    scope,
  )
  if (queuedReports) {
    const reports = Object.fromEntries(Object.values(queuedReports).map((report) => {
      const id = createReportId()
      return [id, { ...report, id, projectId: recoveryId }]
    }))
    await replaceReportsForProject(recoveryId, reports, scope)
  } else {
    await copyReportsToProject(projectId, recoveryId, scope, scope, true)
  }
  await clearProjectSyncOperation(projectId, scope)
  reportProjectSyncError(
    'A newer cloud version was found. Your unsynced work was preserved as a conflict copy.',
  )
}

export async function createProjectWithSync(name = 'Untitled Project'): Promise<ProjectWithSync> {
  if (isNetworkOnline() && isCloudStorageScope()) {
    const remoteProject = await createRemoteProject({ name }, `create:${name}`)
    const project = fromRemote(remoteProject)
    await saveProjectLocal(
      project.id,
      project.name,
      project.nodes,
      project.edges,
      project.patches,
      {
        createdAt: remoteProject.createdAt,
        updatedAt: remoteProject.updatedAt,
        revision: remoteProject.revision,
      },
    )
    return project
  }
  const project: ProjectWithSync = {
    id: createLocalId('local'),
    name,
    nodes: {},
    edges: {},
    patches: {},
    reports: {},
    isLocalOnly: true,
    needsSync: true,
    revision: 0,
  }
  await saveProjectLocal(project.id, project.name, project.nodes, project.edges, project.patches)
  return project
}

export async function deleteProjectWithSync(projectId: string): Promise<void> {
  const scope = getStorageScope()
  const localProject = await loadProjectLocal(projectId)
  if (projectId.startsWith('local_') || !isCloudStorageScope()) {
    const deletion = await enqueueProjectDelete(
      projectId,
      localProject?.revision ?? 0,
      scope,
    )
    const deletedNodes = await finalizeProjectDelete(
      projectId,
      deletion.generation,
      scope,
    )
    if (deletedNodes) await deleteUnreferencedLocalFiles(deletedNodes, scope)
    return
  }

  await enqueueProjectDelete(
    projectId,
    localProject?.revision ?? 0,
    scope,
  )
  if (isNetworkOnline()) {
    try {
      await flushProjectSaveWithSync(projectId, scope)
    } catch (error) {
      if (isRetryableRemoteDeferral(error)) return
      await clearProjectSyncOperation(projectId, scope)
      throw error
    }
  }
}

function createLocalId(prefix: 'local'): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`
}

function createReportId(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `report_${suffix}`
}
