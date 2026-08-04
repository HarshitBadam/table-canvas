import type { Edge, Patches, ProjectNode } from '@/types'
import type { Report } from '@/report/types'
import {
  getDB,
  type ProjectSnapshot,
  type ProjectSyncOperation,
} from './dbCore'
import {
  serializePatches,
  type SerializedPatches,
} from './patchSerialization'
import { getStorageScope, scopedStorageKey } from './storageScope'
import { withoutRuntimeNodeState } from '@/state/transientProjectState'

export interface ProjectSavePayload {
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, SerializedPatches>
  reports: Record<string, Report>
}

export async function saveProjectAndEnqueue(
  projectId: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
  reports: Record<string, Report>,
  scope = getStorageScope(),
): Promise<ProjectSyncOperation> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction(['projects', 'projectSync'], 'readwrite')
  const projectStore = tx.objectStore('projects')
  const syncStore = tx.objectStore('projectSync')
  const [existingProject, existingOperation] = await Promise.all([
    projectStore.get(id),
    syncStore.get(id),
  ])
  if (existingOperation?.operation === 'delete') {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new Error(`Project "${projectId}" was deleted in another tab.`)
  }
  const now = new Date().toISOString()
  const persistedNodes = withoutRuntimeNodeState(nodes)
  const serializedPatches = serializePatches(patches)
  await projectStore.put({
    id,
    entityId: projectId,
    ownerId: scope,
    name,
    nodes: persistedNodes,
    edges,
    patches: serializedPatches,
    createdAt: existingProject?.createdAt ?? now,
    updatedAt: now,
    revision: existingProject?.revision ?? 0,
  })
  const operation: ProjectSyncOperation = {
    id,
    entityId: projectId,
    ownerId: scope,
    projectId,
    generation: (existingOperation?.generation ?? 0) + 1,
    expectedRevision:
      existingOperation?.expectedRevision
      ?? existingProject?.revision
      ?? 0,
    operation: 'save',
    updatedAt: now,
    payload: {
      name,
      nodes: persistedNodes,
      edges,
      patches: serializedPatches,
      reports,
    },
  }
  await syncStore.put(operation)
  await tx.done
  return operation
}

export async function enqueueProjectSave(
  projectId: string,
  payload: ProjectSavePayload,
  expectedRevision: number,
  scope = getStorageScope(),
): Promise<ProjectSyncOperation> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction('projectSync', 'readwrite')
  const existing = await tx.store.get(id)
  if (existing?.operation === 'delete') {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new Error(`Project "${projectId}" was deleted in another tab.`)
  }
  const operation: ProjectSyncOperation = {
    id,
    entityId: projectId,
    ownerId: scope,
    projectId,
    generation: (existing?.generation ?? 0) + 1,
    expectedRevision: existing?.expectedRevision ?? expectedRevision,
    operation: 'save',
    updatedAt: new Date().toISOString(),
    payload,
  }
  await tx.store.put(operation)
  await tx.done
  return operation
}

/**
 * The merge retry cannot go through `enqueueProjectSave`: that path deliberately keeps
 * `expectedRevision` sticky. Payload and revision move together here, and the local
 * project record moves with them so a reload cannot resurrect the pre-merge document.
 */
export async function replaceQueuedProjectSave(
  projectId: string,
  snapshot: ProjectSnapshot,
  expectedRevision: number,
  scope = getStorageScope(),
): Promise<ProjectSyncOperation | null> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction(['projects', 'projectSync'], 'readwrite')
  const projectStore = tx.objectStore('projects')
  const syncStore = tx.objectStore('projectSync')
  const [project, current] = await Promise.all([
    projectStore.get(id),
    syncStore.get(id),
  ])
  if (!current || current.operation !== 'save') {
    await tx.done
    return null
  }

  const now = new Date().toISOString()
  if (project) {
    await projectStore.put({
      ...project,
      name: snapshot.name,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      patches: snapshot.patches,
      updatedAt: now,
      revision: expectedRevision,
    })
  }
  const operation: ProjectSyncOperation = {
    ...current,
    generation: current.generation + 1,
    expectedRevision,
    updatedAt: now,
    payload: snapshot,
  }
  await syncStore.put(operation)
  await tx.done
  return operation
}

export async function enqueueProjectDelete(
  projectId: string,
  expectedRevision: number,
  scope = getStorageScope(),
): Promise<ProjectSyncOperation> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction('projectSync', 'readwrite')
  const syncStore = tx.objectStore('projectSync')
  const existing = await syncStore.get(id)
  const generation = (existing?.generation ?? 0) + 1
  const now = new Date().toISOString()
  const operation: ProjectSyncOperation = {
    id,
    entityId: projectId,
    ownerId: scope,
    projectId,
    generation,
    expectedRevision: existing?.expectedRevision ?? expectedRevision,
    operation: 'delete',
    updatedAt: now,
  }
  await syncStore.put(operation)
  await tx.done
  return operation
}

export async function cancelQueuedProjectDelete(
  projectId: string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction('projectSync', 'readwrite')
  const operation = await tx.store.get(id)
  if (operation?.operation === 'delete') {
    await tx.store.delete(id)
  }
  await tx.done
}

export async function getProjectSyncOperation(
  projectId: string,
  scope = getStorageScope(),
): Promise<ProjectSyncOperation | null> {
  const db = await getDB()
  return await db.get('projectSync', scopedStorageKey(scope, projectId)) ?? null
}

export async function listProjectSyncOperations(
  scope = getStorageScope(),
): Promise<ProjectSyncOperation[]> {
  const db = await getDB()
  return db.getAllFromIndex('projectSync', 'by-owner', scope)
}

export async function acknowledgeProjectSave(
  projectId: string,
  generation: number,
  revision: number,
  serverUpdatedAt: Date | string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction(['projects', 'projectSync'], 'readwrite')
  const [project, current] = await Promise.all([
    tx.objectStore('projects').get(id),
    tx.objectStore('projectSync').get(id),
  ])

  if (project) {
    project.revision = revision
    if (current?.generation === generation) {
      project.updatedAt = new Date(serverUpdatedAt).toISOString()
    }
    await tx.objectStore('projects').put(project)
  }

  if (current?.generation === generation) {
    await tx.objectStore('projectSync').delete(id)
  } else if (current) {
    current.expectedRevision = revision
    await tx.objectStore('projectSync').put(current)
  }
  await tx.done
}

/** Removes durable project content while leaving an offline delete queued. */
export async function deleteProjectSnapshot(
  projectId: string,
  scope = getStorageScope(),
): Promise<Record<string, ProjectNode> | null> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction(['projects', 'reports'], 'readwrite')
  const projectStore = tx.objectStore('projects')
  const project = await projectStore.get(id)
  const reports = await tx.objectStore('reports').index('by-owner-project')
    .getAll([scope, projectId])
  await Promise.all(reports.map(report => tx.objectStore('reports').delete(report.id)))
  await projectStore.delete(id)
  await tx.done
  return project?.nodes ?? null
}

export async function finalizeProjectDelete(
  projectId: string,
  generation: number,
  scope = getStorageScope(),
): Promise<Record<string, ProjectNode> | null> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction(
    ['projects', 'reports', 'projectSync'],
    'readwrite',
  )
  const syncStore = tx.objectStore('projectSync')
  const current = await syncStore.get(id)
  if (
    !current
    || current.operation !== 'delete'
    || current.generation !== generation
  ) {
    await tx.done
    return null
  }

  const projectStore = tx.objectStore('projects')
  const project = await projectStore.get(id)
  const reports = await tx.objectStore('reports').index('by-owner-project')
    .getAll([scope, projectId])
  await Promise.all(reports.map(report => tx.objectStore('reports').delete(report.id)))
  await projectStore.delete(id)
  await syncStore.delete(id)
  await tx.done
  return project?.nodes ?? null
}

export async function clearProjectSyncOperation(
  projectId: string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  await db.delete('projectSync', scopedStorageKey(scope, projectId))
}
