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
import { isNetworkOnline, updateSyncStatus } from './syncState'

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

export async function fetchProjects(): Promise<ProjectSummary[]> {
  if (isNetworkOnline()) {
    try {
      return await listProjects()
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
  if (isNetworkOnline()) {
    try {
      const project = await getProject(projectId)
      const loaded = fromRemote(project)
      await saveProjectLocal(loaded.id, loaded.name, loaded.nodes, loaded.edges, loaded.patches)
      return loaded
    } catch (error) {
      console.error('[syncService] Failed to load project from backend:', error)
    }
  }
  const project = await loadProjectLocal(projectId)
  if (!project) return null
  return {
    ...project,
    patches: deserializePatches(project.patches),
    isLocalOnly: !isNetworkOnline(),
    needsSync: !isNetworkOnline(),
  }
}

export async function createProjectWithSync(name = 'Untitled Project'): Promise<ProjectWithSync> {
  if (isNetworkOnline()) {
    try {
      const project = fromRemote(await createProject({ name }))
      await saveProjectLocal(project.id, project.name, project.nodes, project.edges, project.patches)
      return project
    } catch (error) {
      console.error('[syncService] Failed to create project on backend:', error)
    }
  }
  const project: ProjectWithSync = {
    id: `local_${Date.now()}`,
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

let saveTimeout: ReturnType<typeof setTimeout> | null = null

async function saveToBackend(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
): Promise<void> {
  if (!isNetworkOnline() || projectId.startsWith('local_')) return
  updateSyncStatus({ isSyncing: true, error: null })
  try {
    await updateProject(projectId, { name, nodes, edges, patches: serializePatches(patches) })
    updateSyncStatus({ isSyncing: false, lastSyncedAt: new Date(), error: null })
  } catch (error) {
    console.error('[Sync] Failed to save to backend:', error)
    updateSyncStatus({
      isSyncing: false,
      error: error instanceof Error ? error.message : 'Sync failed',
    })
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
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => { void saveToBackend(projectId, name, nodes, edges, patches) }, 2000)
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

export async function importProjectWithSync(project: Omit<ProjectWithSync, 'id' | 'isLocalOnly' | 'needsSync'>): Promise<ProjectWithSync> {
  if (isNetworkOnline()) {
    try {
      const created = await createProject({ name: project.name })
      await updateProject(created.id, { ...project, patches: serializePatches(project.patches) })
      const result = { ...project, id: created.id, isLocalOnly: false, needsSync: false }
      await saveProjectLocal(result.id, result.name, result.nodes, result.edges, result.patches)
      return result
    } catch (error) {
      console.error('[Sync] Failed to import project to server:', error)
    }
  }
  const result = { ...project, id: `local_${Date.now()}`, isLocalOnly: true, needsSync: true }
  await saveProjectLocal(result.id, result.name, result.nodes, result.edges, result.patches)
  return result
}

export async function syncLocalProjectsToBackend(): Promise<void> {
  if (!isNetworkOnline()) return
  for (const summary of await listProjectsLocal()) {
    if (!summary.id.startsWith('local_')) continue
    const project = await loadProjectLocal(summary.id)
    if (!project) continue
    try {
      const created = await createProject({
        name: project.name,
        nodes: project.nodes,
        edges: project.edges,
        patches: project.patches,
      })
      await deleteProjectLocal(summary.id)
      await saveProjectLocal(
        created.id,
        created.name,
        created.nodes,
        created.edges,
        deserializePatches(created.patches),
      )
    } catch (error) {
      console.error('[syncService] Failed to sync local project to backend:', error)
    }
  }
}
