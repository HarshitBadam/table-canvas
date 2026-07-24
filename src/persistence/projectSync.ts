import {
  deleteProject as deleteProjectRemote, getProject, listProjects, updateProject,
  type ProjectPayload, type ProjectSummary,
} from '@/api/projects.api'
import type { Edge, Patches, ProjectNode } from '@/types'
import {
  deleteProject as deleteProjectLocal, listProjects as listProjectsLocal,
  loadProject as loadProjectLocal, saveProject as saveProjectLocal, updateProjectRevision,
} from './db'
import { deserializePatches, serializePatches } from './patchSerialization'
import { isNetworkOnline } from './syncState'
import { withoutTransientComputeState } from '@/state/transientProjectState'
import {
  createRemoteProject, ProjectCleanupError, isRetryableRemoteDeferral,
} from './projectCreateReconciliation'
import { promoteLocalFileRefs } from './projectFilePromotion'
import { deleteUnreferencedLocalFiles } from './fileGarbageCollection'
import {
  clearPendingProjectSave, clearProjectRevision, flushProjectSaveWithSync,
  reportProjectSyncError, setProjectRevision,
} from './projectSaveSync'
import { isCloudStorageScope } from './storageScope'
import type { Report } from '@/report/types'
import {
  copyReportsToProject, loadReportsForProject, replaceReportsForProject,
} from './reportStorage'
export {
  isRetryableRemoteDeferral,
} from './projectCreateReconciliation'
export { syncLocalProjectsToBackend } from './localProjectPromotion'
export {
  flushProjectSaveWithSync, saveProjectWithSync, setProjectSyncErrorHandler,
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
  setProjectRevision(project.id, revision)
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
      const [remoteProjects, localProjects] = await Promise.all([
        listProjects(),
        listProjectsLocal(),
      ])
      const localById = new Map(localProjects.map(project => [project.id, project]))
      const merged = remoteProjects.map((remote) => {
        const local = localById.get(remote.id)
        if (!local || toTimestamp(local.updatedAt) <= toTimestamp(remote.updatedAt)) {
          return remote
        }
        return {
          ...remote,
          name: local.name,
          updatedAt: new Date(local.updatedAt),
        }
      })
      for (const local of localProjects) {
        if (!local.id.startsWith('local_')) continue
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
  const localProject = await loadProjectLocal(projectId)
  const localReports = await loadReportsForProject(projectId)
  if (projectId.startsWith('local_')) {
    if (!localProject) return null
    const localOnly = {
      ...localProject,
      patches: deserializePatches(localProject.patches),
      isLocalOnly: true,
      needsSync: true,
      revision: localProject.revision ?? 0,
    }
    setProjectRevision(projectId, localOnly.revision)
    return localOnly
  }

  if (isNetworkOnline() && isCloudStorageScope()) {
    try {
      const remoteProject = await getProject(projectId)
      if (
        localProject
        && toTimestamp(localProject.updatedAt) > toTimestamp(remoteProject.updatedAt)
      ) {
        const patches = deserializePatches(localProject.patches)
        const localRevision = localProject.revision ?? 0
        if (localRevision < (remoteProject.revision ?? 0)) {
          const recoveryId = createLocalId('local')
          await saveProjectLocal(
            recoveryId,
            `${localProject.name} (conflict copy)`,
            localProject.nodes,
            localProject.edges,
            patches,
            { revision: 0 },
          )
          await copyReportsToProject(
            projectId,
            recoveryId,
          )
          reportProjectSyncError(
            'A newer cloud version was found. Your unsynced work was preserved as a conflict copy.',
          )
        } else {
          try {
            const updated = await updateProject(projectId, {
              name: localProject.name,
              nodes: localProject.nodes,
              edges: localProject.edges,
              patches: localProject.patches,
              reports: localReports,
              expectedRevision: remoteProject.revision ?? 0,
            })
            setProjectRevision(projectId, updated.revision)
            await updateProjectRevision(projectId, updated.revision, updated.updatedAt)
            return {
              ...localProject,
              patches,
              isLocalOnly: false,
              needsSync: false,
              revision: updated.revision,
            }
          } catch (error) {
            console.error('[syncService] Failed to upload newer local project:', error)
            if (!isRetryableRemoteDeferral(error)) throw error
            setProjectRevision(
              projectId,
              localRevision,
            )
            return {
              ...localProject,
              patches,
              isLocalOnly: false,
              needsSync: true,
              revision: localRevision,
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
    needsSync: true,
    revision: localProject.revision ?? 0,
  }
  setProjectRevision(projectId, fallback.revision)
  return fallback
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
  const localProject = await loadProjectLocal(projectId)
  await deleteProjectLocal(projectId)
  if (
    isNetworkOnline()
    && isCloudStorageScope()
    && !projectId.startsWith('local_')
  ) {
    try {
      await flushProjectSaveWithSync(projectId)
      await deleteProjectRemote(projectId)
    } catch (error) {
      if (localProject) {
        try {
          await saveProjectLocal(
            localProject.id,
            localProject.name,
            localProject.nodes,
            localProject.edges,
            deserializePatches(localProject.patches),
            {
              createdAt: localProject.createdAt,
              updatedAt: localProject.updatedAt,
              revision: localProject.revision,
            },
          )
        } catch (restoreError) {
          throw new ProjectCleanupError(
            'Project deletion failed and the local restoration also failed.',
            { deleteError: error, restoreError },
          )
        }
      }
      throw error
    }
  }
  clearPendingProjectSave(projectId)
  clearProjectRevision(projectId)
  if (localProject) {
    await deleteUnreferencedLocalFiles(localProject.nodes)
  }
}

export async function importProjectWithSync(
  project: Omit<
    ProjectWithSync,
    'id' | 'isLocalOnly' | 'needsSync' | 'revision' | 'reports'
  > & { reports?: Record<string, Report> | Report[] },
): Promise<ProjectWithSync> {
  let createdProjectId: string | undefined
  if (isNetworkOnline() && isCloudStorageScope()) {
    try {
      const recoveryKey = `import:${project.name}:${Object.keys(project.nodes).sort().join(',')}`
      const created = await createRemoteProject({ name: project.name }, recoveryKey)
      createdProjectId = created.id
      const nodes = await promoteLocalFileRefs(created.id, project.nodes)
      const reportEntries = Array.isArray(project.reports)
        ? project.reports.map(report => [report.id, report] as const)
        : Object.entries(project.reports ?? {})
      const reports = Object.fromEntries(
        reportEntries.map(([id, report]) => [
          id,
          { ...report, projectId: created.id },
        ]),
      )
      const payload: ProjectPayload = {
        name: project.name,
        nodes,
        edges: project.edges,
        patches: serializePatches(project.patches),
        expectedRevision: created.revision,
        reports,
      }
      const updated = await updateProject(created.id, payload)
      const result = {
        ...project,
        reports,
        nodes,
        id: created.id,
        isLocalOnly: false,
        needsSync: false,
        revision: updated.revision,
      }
      setProjectRevision(result.id, updated.revision)
      await saveProjectLocal(
        result.id,
        result.name,
        result.nodes,
        result.edges,
        result.patches,
        { revision: updated.revision, updatedAt: updated.updatedAt },
      )
      await replaceReportsForProject(
        result.id,
        payload.reports,
      )
      return result
    } catch (error) {
      console.error('[Sync] Failed to import project to server:', error)
      if (createdProjectId) {
        try {
          await deleteProjectRemote(createdProjectId)
        } catch (cleanupError) {
          throw new ProjectCleanupError(
            'Import failed and the partial server project could not be cleaned up.',
            cleanupError,
          )
        }
      }
      throw error
    }
  }
  const reports = Object.fromEntries(
    (Array.isArray(project.reports)
      ? project.reports.map(report => [report.id, report] as const)
      : Object.entries(project.reports ?? {})),
  )
  const result = {
    ...project,
    reports,
    id: createLocalId('local'),
    isLocalOnly: true,
    needsSync: true,
    revision: 0,
  }
  await saveProjectLocal(result.id, result.name, result.nodes, result.edges, result.patches)
  return result
}

function createLocalId(prefix: 'local'): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`
}
