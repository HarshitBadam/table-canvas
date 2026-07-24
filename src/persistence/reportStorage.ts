import type { Report } from '@/report/types'
import { getDB } from './dbCore'
import {
  getStorageScope,
  isLegacyRecord,
  scopedStorageKey,
} from './storageScope'

export async function saveReport(
  report: Report,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  await db.put('reports', {
    ...report,
    id: scopedStorageKey(scope, report.id),
    entityId: report.id,
    ownerId: scope,
  })
  if (scope === 'guest') {
    await db.delete('reports', report.id)
  }
}

export async function loadReport(
  id: string,
  scope = getStorageScope(),
): Promise<Report | null> {
  const db = await getDB()
  let report = await db.get('reports', scopedStorageKey(scope, id))
  if (!report && scope === 'guest') {
    report = await db.get('reports', id)
  }
  return report ? fromStoredReport(report) : null
}

export async function loadAllReports(
  scope = getStorageScope(),
): Promise<Record<string, Report>> {
  const db = await getDB()
  const reports = await db.getAll('reports')
  const result: Record<string, Report> = {}
  for (const stored of reports) {
    if (
      stored.ownerId !== scope
      && !(scope === 'guest' && isLegacyRecord(stored.ownerId))
    ) continue
    const report = fromStoredReport(stored)
    result[report.id] = report
  }
  return result
}

export async function loadReportsForProject(
  projectId: string,
  scope = getStorageScope(),
): Promise<Record<string, Report>> {
  const reports = await loadAllReports(scope)
  return Object.fromEntries(
    Object.entries(reports).filter(([, report]) => report.projectId === projectId),
  )
}

export async function listReports(
  projectId?: string,
  scope = getStorageScope(),
): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const db = await getDB()
  const reports = await db.getAllFromIndex('reports', 'by-updated')

  return reports
    .filter(report => (
      (report.ownerId === scope || (scope === 'guest' && isLegacyRecord(report.ownerId)))
      && (!projectId || report.projectId === projectId)
    ))
    .map(stored => {
      const report = fromStoredReport(stored)
      return {
    id: report.id,
    name: report.name,
    updatedAt: report.updatedAt,
      }
    }).reverse()
}

export async function deleteReport(
  id: string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  await db.delete('reports', scopedStorageKey(scope, id))
  if (scope === 'guest') {
    await db.delete('reports', id)
  }
}

export async function saveAllReports(
  reports: Record<string, Report>,
  scope = getStorageScope(),
): Promise<void> {
  for (const report of Object.values(reports)) {
    await saveReport(report, scope)
  }
}

export async function deleteReportsForProject(
  projectId: string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  const reports = await db.getAll('reports')
  const tx = db.transaction('reports', 'readwrite')

  for (const report of reports) {
    const belongsToScope = (
      report.ownerId === scope
      || (scope === 'guest' && isLegacyRecord(report.ownerId))
    )
    if (belongsToScope && report.projectId === projectId) {
      await tx.store.delete(report.id)
    }
  }

  await tx.done
}

export async function copyReportsToProject(
  sourceProjectId: string,
  destinationProjectId: string,
  sourceScope: string,
  destinationScope = getStorageScope(),
): Promise<void> {
  const reports = await loadReportsForProject(sourceProjectId, sourceScope)
  await Promise.all(Object.values(reports).map(report => saveReport({
    ...report,
    projectId: destinationProjectId,
    updatedAt: new Date().toISOString(),
  }, destinationScope)))
}

function fromStoredReport(
  stored: import('./dbCore').TableCanvasDB['reports']['value'],
): Report {
  const { entityId, ownerId: _ownerId, ...report } = stored
  return {
    ...report,
    id: entityId ?? stored.id,
  }
}
