import type { Edge, Patches, ProjectNode } from '@/types'
import type { Report } from '@/report/types'
import { getDB, type ProjectSyncOperation } from './dbCore'
import {
  serializePatches,
  type SerializedPatches,
} from './patchSerialization'
import { getStorageScope, scopedStorageKey } from './storageScope'
import { withoutTransientComputeState } from '@/state/transientProjectState'

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
  const now = new Date().toISOString()
  const persistedNodes = withoutTransientComputeState(nodes)
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
  const existing = await db.get('projectSync', id)
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
  await db.put('projectSync', operation)
  return operation
}

export async function enqueueProjectDelete(
  projectId: string,
  expectedRevision: number,
  scope = getStorageScope(),
): Promise<ProjectSyncOperation> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const existing = await db.get('projectSync', id)
  const operation: ProjectSyncOperation = {
    id,
    entityId: projectId,
    ownerId: scope,
    projectId,
    generation: (existing?.generation ?? 0) + 1,
    expectedRevision: existing?.expectedRevision ?? expectedRevision,
    operation: 'delete',
    updatedAt: new Date().toISOString(),
  }
  await db.put('projectSync', operation)
  return operation
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

export async function finalizeProjectDelete(
  projectId: string,
  generation: number,
  scope = getStorageScope(),
): Promise<Record<string, ProjectNode> | null> {
  const db = await getDB()
  const id = scopedStorageKey(scope, projectId)
  const tx = db.transaction(['projects', 'reports', 'projectSync'], 'readwrite')
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
