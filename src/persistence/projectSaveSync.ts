import { updateProject } from '@/api/projects.api'
import type { Edge, Patches, ProjectNode } from '@/types'
import { serializePatches } from './patchSerialization'
import { saveProject as saveProjectLocal, updateProjectRevision } from './db'
import { isNetworkOnline } from './syncState'
import { withoutTransientComputeState } from '@/state/transientProjectState'
import { isCloudStorageScope } from './storageScope'
import type { Report } from '@/report/types'

const projectRevisions = new Map<string, number>()
const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const pendingBackendSaves = new Map<string, {
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  reports: Record<string, Report>
}>()

let projectSyncErrorHandler: ((message: string | null) => void) | null = null

export function setProjectSyncErrorHandler(
  handler: ((message: string | null) => void) | null,
): void {
  projectSyncErrorHandler = handler
}

export function reportProjectSyncError(message: string): void {
  projectSyncErrorHandler?.(message)
}

export function setProjectRevision(projectId: string, revision: number): void {
  projectRevisions.set(projectId, revision)
}

export function clearProjectRevision(projectId: string): void {
  projectRevisions.delete(projectId)
}

async function saveToBackend(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
  reports: Record<string, Report>,
): Promise<void> {
  if (
    !isNetworkOnline()
    || !isCloudStorageScope()
    || projectId.startsWith('local_')
  ) return
  const expectedRevision = projectRevisions.get(projectId) ?? 0
  const updated = await updateProject(projectId, {
    name,
    nodes: withoutTransientComputeState(nodes),
    edges,
    patches: serializePatches(patches),
    reports,
    expectedRevision,
  })
  setProjectRevision(projectId, updated.revision)
  await updateProjectRevision(projectId, updated.revision, updated.updatedAt)
  projectSyncErrorHandler?.(null)
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
      pending.reports,
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
  reports: Record<string, Report> = {},
): Promise<void> {
  const persistedNodes = withoutTransientComputeState(nodes)
  await saveProjectLocal(projectId, name, persistedNodes, edges, patches)
  pendingBackendSaves.set(projectId, {
    name,
    nodes: persistedNodes,
    edges,
    patches,
    reports,
  })
  const existingTimeout = saveTimeouts.get(projectId)
  if (existingTimeout) clearTimeout(existingTimeout)
  const timeout = setTimeout(() => {
    void flushProjectSaveWithSync(projectId).catch((error) => {
      console.error('[Sync] Failed to save to backend:', error)
      projectSyncErrorHandler?.(
        error instanceof Error ? error.message : 'Project sync failed',
      )
    })
  }, 2000)
  saveTimeouts.set(projectId, timeout)
}

export function clearPendingProjectSave(projectId: string): void {
  const timeout = saveTimeouts.get(projectId)
  if (timeout) clearTimeout(timeout)
  saveTimeouts.delete(projectId)
  pendingBackendSaves.delete(projectId)
}
