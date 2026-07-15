import {
  createProject,
  deleteProject as deleteProjectRemote,
  getProject,
  listProjects,
  updateProject,
  type ProjectSummary,
} from '@/api/projects.api'
import type { Edge, Patches, ProjectNode } from '@/types'
import {
  deleteProject as deleteProjectLocal,
  listProjects as listProjectsLocal,
  loadProject as loadProjectLocal,
  saveProject as saveProjectLocal,
} from './db'
import { deserializePatches, serializePatches } from './patchSerialization'
import { isNetworkOnline } from './syncState'
import { loadFileRecord } from './fileStorage'
import { uploadFileWithSync } from './fileSync'

export interface ProjectWithSync {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  isLocalOnly?: boolean
  needsSync?: boolean
}

function fromRemote(project: Awaited<ReturnType<typeof getProject>>): ProjectWithSync {
  return {
    id: project.id,
    name: project.name,
    nodes: project.nodes,
    edges: project.edges,
    patches: deserializePatches(project.patches),
    isLocalOnly: false,
    needsSync: false,
  }
}

function toTimestamp(value: Date | string | undefined): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  if (isNetworkOnline()) {
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
  if (projectId.startsWith('local_')) {
    if (!localProject) return null
    return {
      ...localProject,
      patches: deserializePatches(localProject.patches),
      isLocalOnly: true,
      needsSync: true,
    }
  }

  if (isNetworkOnline()) {
    try {
      const remoteProject = await getProject(projectId)
      if (
        localProject
        && toTimestamp(localProject.updatedAt) > toTimestamp(remoteProject.updatedAt)
      ) {
        const patches = deserializePatches(localProject.patches)
        try {
          await updateProject(projectId, {
            name: localProject.name,
            nodes: localProject.nodes,
            edges: localProject.edges,
            patches: localProject.patches,
          })
          return {
            ...localProject,
            patches,
            isLocalOnly: false,
            needsSync: false,
          }
        } catch (error) {
          console.error('[syncService] Failed to upload newer local project:', error)
          return {
            ...localProject,
            patches,
            isLocalOnly: false,
            needsSync: true,
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
        },
      )
      return loaded
    } catch (error) {
      console.error('[syncService] Failed to load project from backend:', error)
    }
  }
  if (!localProject) return null
  return {
    ...localProject,
    patches: deserializePatches(localProject.patches),
    isLocalOnly: !isNetworkOnline(),
    needsSync: true,
  }
}

export async function createProjectWithSync(name = 'Untitled Project'): Promise<ProjectWithSync> {
  if (isNetworkOnline()) {
    try {
      const remoteProject = await createProject({ name })
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
        },
      )
      return project
    } catch (error) {
      console.error('[syncService] Failed to create project on backend:', error)
    }
  }
  const project: ProjectWithSync = {
    id: createLocalId('local'),
    name,
    nodes: {},
    edges: {},
    patches: {},
    isLocalOnly: true,
    needsSync: true,
  }
  await saveProjectLocal(project.id, project.name, project.nodes, project.edges, project.patches)
  return project
}

const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const pendingBackendSaves = new Map<string, {
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
}>()

async function saveToBackend(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
): Promise<void> {
  if (!isNetworkOnline() || projectId.startsWith('local_')) return
  await updateProject(projectId, { name, nodes, edges, patches: serializePatches(patches) })
}

export async function flushProjectSaveWithSync(projectId: string): Promise<void> {
  const timeout = saveTimeouts.get(projectId)
  if (timeout) clearTimeout(timeout)
  saveTimeouts.delete(projectId)

  const pending = pendingBackendSaves.get(projectId)
  if (!pending) return
  try {
    await saveToBackend(
      projectId,
      pending.name,
      pending.nodes,
      pending.edges,
      pending.patches,
    )
    if (pendingBackendSaves.get(projectId) === pending) {
      pendingBackendSaves.delete(projectId)
    }
  } catch (error) {
    pendingBackendSaves.set(projectId, pending)
    throw error
  }
}

export async function saveProjectWithSync(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
): Promise<void> {
  await saveProjectLocal(projectId, name, nodes, edges, patches)
  pendingBackendSaves.set(projectId, { name, nodes, edges, patches })
  const existingTimeout = saveTimeouts.get(projectId)
  if (existingTimeout) clearTimeout(existingTimeout)
  const timeout = setTimeout(() => {
    void flushProjectSaveWithSync(projectId).catch((error) => {
      console.error('[Sync] Failed to save to backend:', error)
    })
  }, 2000)
  saveTimeouts.set(projectId, timeout)
}

export async function deleteProjectWithSync(projectId: string): Promise<void> {
  await deleteProjectLocal(projectId)
  if (isNetworkOnline() && !projectId.startsWith('local_')) {
    try {
      await deleteProjectRemote(projectId)
    } catch (error) {
      console.error('[syncService] Failed to delete project from backend:', error)
    }
  }
}

async function promoteLocalFileRefs(
  projectId: string,
  sourceNodes: Record<string, ProjectNode>,
): Promise<Record<string, ProjectNode>> {
  const nodes = structuredClone(sourceNodes)
  for (const node of Object.values(nodes)) {
    if (node.kind !== 'source_table' || !node.plan.fileRef.startsWith('local_file_')) {
      continue
    }
    const file = await loadFileRecord(node.plan.fileRef)
    if (!file) throw new Error(`Local data file for "${node.name}" is missing`)
    const uploaded = await uploadFileWithSync(
      new File([file.data], file.name, { type: file.type }),
      projectId,
    )
    if (uploaded.id.startsWith('local_file_')) {
      throw new Error(`Could not upload data file for "${node.name}"`)
    }
    node.plan.fileRef = uploaded.id
  }
  return nodes
}

export async function importProjectWithSync(project: Omit<ProjectWithSync, 'id' | 'isLocalOnly' | 'needsSync'>): Promise<ProjectWithSync> {
  let createdProjectId: string | undefined
  if (isNetworkOnline()) {
    try {
      const created = await createProject({ name: project.name })
      createdProjectId = created.id
      const nodes = await promoteLocalFileRefs(created.id, project.nodes)
      await updateProject(created.id, {
        ...project,
        nodes,
        patches: serializePatches(project.patches),
      })
      const result = {
        ...project,
        nodes,
        id: created.id,
        isLocalOnly: false,
        needsSync: false,
      }
      await saveProjectLocal(result.id, result.name, result.nodes, result.edges, result.patches)
      return result
    } catch (error) {
      console.error('[Sync] Failed to import project to server:', error)
      if (createdProjectId) {
        try {
          await deleteProjectRemote(createdProjectId)
        } catch (cleanupError) {
          console.error('[Sync] Failed to clean up partial imported project:', cleanupError)
        }
      }
    }
  }
  const result = { ...project, id: createLocalId('local'), isLocalOnly: true, needsSync: true }
  await saveProjectLocal(result.id, result.name, result.nodes, result.edges, result.patches)
  return result
}

export async function syncLocalProjectsToBackend(): Promise<void> {
  if (!isNetworkOnline()) return
  for (const summary of await listProjectsLocal()) {
    if (!summary.id.startsWith('local_')) continue
    const project = await loadProjectLocal(summary.id)
    if (!project) continue
    let createdProjectId: string | undefined
    let promotionCommitted = false
    try {
      const created = await createProject({ name: project.name })
      createdProjectId = created.id
      const nodes = await promoteLocalFileRefs(created.id, project.nodes)
      await saveProjectLocal(
        created.id,
        project.name,
        nodes,
        project.edges,
        deserializePatches(project.patches),
      )
      await deleteProjectLocal(summary.id)
      promotionCommitted = true
      await updateProject(created.id, {
        name: project.name,
        nodes,
        edges: project.edges,
        patches: project.patches,
      })
    } catch (error) {
      console.error('[syncService] Failed to sync local project to backend:', error)
      if (createdProjectId && !promotionCommitted) {
        try {
          await deleteProjectRemote(createdProjectId)
        } catch (cleanupError) {
          console.error('[syncService] Failed to clean up partial remote project:', cleanupError)
        }
      }
    }
  }
}

function createLocalId(prefix: 'local'): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `${prefix}_${suffix}`
}
