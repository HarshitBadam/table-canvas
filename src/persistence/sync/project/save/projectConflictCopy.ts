import { getDB, type ProjectSnapshot } from '../../../storage/local-db/dbCore'
import {
  isStorageScopeContextCurrent,
  scopedStorageKey,
  type StorageScopeContext,
} from '../../../storage/storageScope'
import { reportProjectSyncError } from '../../session/syncNotifications'

/**
 * Last resort when a cross-device conflict cannot be merged: the unsynced work survives
 * as a separate local project so the newer cloud version can be loaded over the top.
 */
export async function preserveConflictCopy(
  projectId: string,
  snapshot: ProjectSnapshot,
  attemptedGeneration: number,
  scope: string,
  context: StorageScopeContext,
  deleteOriginal = false,
): Promise<boolean> {
  const db = await getDB()
  const recoveryId = createLocalId()
  const originalKey = scopedStorageKey(scope, projectId)
  const recoveryKey = scopedStorageKey(scope, recoveryId)
  const tx = db.transaction(['projects', 'reports', 'projectSync'], 'readwrite')
  const syncStore = tx.objectStore('projectSync')
  const current = await syncStore.get(originalKey)
  if (
    !current
    || current.operation !== 'save'
    || current.generation !== attemptedGeneration
    || context.scope !== scope
    || !isStorageScopeContextCurrent(context)
  ) {
    await tx.done
    return false
  }

  const now = new Date().toISOString()
  await tx.objectStore('projects').put({
    id: recoveryKey,
    entityId: recoveryId,
    ownerId: scope,
    name: `${snapshot.name} (conflict copy)`,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    patches: snapshot.patches,
    createdAt: now,
    updatedAt: now,
    revision: 0,
  })
  await Promise.all(Object.values(snapshot.reports).map((report) => {
    const id = createReportId()
    return tx.objectStore('reports').put({
      ...report,
      id: scopedStorageKey(scope, id),
      entityId: id,
      ownerId: scope,
      projectId: recoveryId,
    })
  }))
  if (deleteOriginal) {
    const reports = await tx.objectStore('reports').index('by-owner-project')
      .getAll([scope, projectId])
    await Promise.all(reports.map(report => tx.objectStore('reports').delete(report.id)))
    await tx.objectStore('projects').delete(originalKey)
  }
  await syncStore.delete(originalKey)
  await tx.done
  reportProjectSyncError(
    'A newer cloud version was found. Your unsynced work was preserved as a conflict copy.',
  )
  return true
}

function createLocalId(): string {
  return `local_${createSuffix()}`
}

function createReportId(): string {
  return `report_${createSuffix()}`
}

function createSuffix(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
}
