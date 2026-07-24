import type { ProjectNode, Edge, Patches } from '@/types'
import { getDB } from './dbCore'
import { serializePatches, type SerializedPatches } from './patchSerialization'
import { withoutTransientComputeState } from '@/state/transientProjectState'
import {
  getStorageScope,
  isLegacyRecord,
  scopedStorageKey,
} from './storageScope'

export interface StoredProject {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, SerializedPatches>
  createdAt: string
  updatedAt: string
  revision?: number
}

export async function saveProject(
  id: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
  sourceTimestamps?: {
    createdAt?: Date | string
    updatedAt?: Date | string
    revision?: number
  },
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  const key = scopedStorageKey(scope, id)
  const existing = await db.get('projects', key)
  const now = new Date().toISOString()
  const normalizeTimestamp = (value: Date | string | undefined): string | undefined => {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }

  const project = {
    id: key,
    entityId: id,
    ownerId: scope,
    name,
    nodes: withoutTransientComputeState(nodes),
    edges,
    patches: serializePatches(patches),
    createdAt:
      normalizeTimestamp(sourceTimestamps?.createdAt)
      ?? existing?.createdAt
      ?? now,
    updatedAt: normalizeTimestamp(sourceTimestamps?.updatedAt) ?? now,
    revision: sourceTimestamps?.revision ?? existing?.revision ?? 0,
  }

  await db.put('projects', project)
  if (scope === 'guest') {
    await db.delete('projects', id)
  }
}

export async function loadProject(
  id: string,
  scope = getStorageScope(),
): Promise<StoredProject | null> {
  const db = await getDB()
  let project = await db.get('projects', scopedStorageKey(scope, id))
  if (!project && scope === 'guest') {
    project = await db.get('projects', id)
  }
  if (!project) return null
  const stored = project as unknown as StoredProject & {
    entityId?: string
    ownerId?: string
  }
  if (!isLegacyRecord(stored.ownerId) && stored.ownerId !== scope) return null
  return {
    ...stored,
    id: stored.entityId ?? stored.id,
    nodes: withoutTransientComputeState(stored.nodes),
  }
}

export async function listProjects(
  scope = getStorageScope(),
): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const db = await getDB()
  const projects = await db.getAllFromIndex('projects', 'by-updated')

  return projects
    .filter(project => (
      project.ownerId === scope
      || (scope === 'guest' && isLegacyRecord(project.ownerId))
    ))
    .map(project => ({
      id: project.entityId ?? project.id,
      name: project.name,
      updatedAt: project.updatedAt,
    }))
    .reverse()
}

export async function deleteProject(
  id: string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  await db.delete('projects', scopedStorageKey(scope, id))
  if (scope === 'guest') {
    await db.delete('projects', id)
  }
}

export async function updateProjectRevision(
  id: string,
  revision: number,
  updatedAt: Date | string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  const key = scopedStorageKey(scope, id)
  const project = await db.get('projects', key)
  if (!project) return
  project.revision = revision
  project.updatedAt = new Date(updatedAt).toISOString()
  await db.put('projects', project)
}
