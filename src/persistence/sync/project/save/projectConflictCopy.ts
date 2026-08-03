import { saveProject as saveProjectLocal } from '../../../storage/local-db/db'
import type { ProjectSnapshot } from '../../../storage/local-db/dbCore'
import { deserializePatches } from '../../../storage/local-db/patchSerialization'
import { clearProjectSyncOperation } from './projectSyncQueue'
import { replaceReportsForProject } from '../../../storage/local-db/reportStorage'
import { reportProjectSyncError } from '../../session/syncNotifications'

/**
 * Last resort when a cross-device conflict cannot be merged: the unsynced work survives
 * as a separate local project so the newer cloud version can be loaded over the top.
 */
export async function preserveConflictCopy(
  projectId: string,
  snapshot: ProjectSnapshot,
  scope: string,
): Promise<void> {
  const recoveryId = createLocalId()
  await saveProjectLocal(
    recoveryId,
    `${snapshot.name} (conflict copy)`,
    snapshot.nodes,
    snapshot.edges,
    deserializePatches(snapshot.patches),
    { revision: 0 },
    scope,
  )
  const reports = Object.fromEntries(Object.values(snapshot.reports).map((report) => {
    const id = createReportId()
    return [id, { ...report, id, projectId: recoveryId }]
  }))
  await replaceReportsForProject(recoveryId, reports, scope)
  await clearProjectSyncOperation(projectId, scope)
  reportProjectSyncError(
    'A newer cloud version was found. Your unsynced work was preserved as a conflict copy.',
  )
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
