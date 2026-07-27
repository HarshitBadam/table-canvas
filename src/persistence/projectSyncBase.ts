import type { Edge, ProjectNode } from '@/types'
import type { Report } from '@/report/types'
import { withoutRuntimeNodeState } from '@/state/transientProjectState'
import {
  getDB,
  type ProjectSnapshot,
  type ProjectSyncBaseRecord,
} from './dbCore'
import type { SerializedPatches } from './patchSerialization'
import { getStorageScope, scopedStorageKey } from './storageScope'

export async function putProjectSyncBase(
  projectId: string,
  revision: number,
  snapshot: ProjectSnapshot,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  await db.put('projectSyncBase', {
    id: scopedStorageKey(scope, projectId),
    entityId: projectId,
    ownerId: scope,
    projectId,
    revision,
    capturedAt: new Date().toISOString(),
    snapshot: structuredClone(snapshot),
  })
}

export async function getProjectSyncBase(
  projectId: string,
  scope = getStorageScope(),
): Promise<ProjectSyncBaseRecord | null> {
  const db = await getDB()
  return await db.get('projectSyncBase', scopedStorageKey(scope, projectId)) ?? null
}

export async function clearProjectSyncBase(
  projectId: string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  await db.delete('projectSyncBase', scopedStorageKey(scope, projectId))
}

/** The wire shape, so a base compares like with like against a queued payload. */
export function remoteProjectSnapshot(project: {
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, SerializedPatches>
  reports?: Record<string, Report>
}): ProjectSnapshot {
  return {
    name: project.name,
    nodes: withoutRuntimeNodeState(project.nodes),
    edges: project.edges,
    patches: project.patches,
    reports: project.reports ?? {},
  }
}

/**
 * Bookkeeping for the next merge, never a reason to fail an operation the server has
 * already accepted: without a base a 409 simply falls back to the conflict copy.
 */
export async function captureProjectSyncBase(
  projectId: string,
  revision: number,
  snapshot: ProjectSnapshot,
  scope = getStorageScope(),
): Promise<void> {
  try {
    await putProjectSyncBase(projectId, revision, snapshot, scope)
  } catch (error) {
    console.error('[Sync] Failed to record the merge base snapshot:', error)
  }
}

export async function dropProjectSyncBase(
  projectId: string,
  scope = getStorageScope(),
): Promise<void> {
  try {
    await clearProjectSyncBase(projectId, scope)
  } catch (error) {
    console.error('[Sync] Failed to discard the merge base snapshot:', error)
  }
}
