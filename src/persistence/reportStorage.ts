import type { Report } from '@/report/types'
import { getDB } from './dbCore'
import {
  getStorageScope,
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
}

export async function loadReport(
  id: string,
  scope = getStorageScope(),
): Promise<Report | null> {
  const db = await getDB()
  const report = await db.get('reports', scopedStorageKey(scope, id))
  return report ? fromStoredReport(report) : null
}

export async function loadAllReports(
  scope = getStorageScope(),
): Promise<Record<string, Report>> {
  const db = await getDB()
  const reports = await db.getAllFromIndex('reports', 'by-owner', scope)
  const result: Record<string, Report> = {}
  for (const stored of reports) {
    const report = fromStoredReport(stored)
    result[report.id] = report
  }
  return result
}

export async function loadReportsForProject(
  projectId: string,
  scope = getStorageScope(),
): Promise<Record<string, Report>> {
  const db = await getDB()
  const reports = await db.getAllFromIndex(
    'reports',
    'by-owner-project',
    [scope, projectId],
  )
  return Object.fromEntries(reports.map((stored) => {
    const report = fromStoredReport(stored)
    return [report.id, report]
  }))
}

export async function listReports(
  projectId?: string,
  scope = getStorageScope(),
): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const db = await getDB()
  const reports = projectId
    ? await db.getAllFromIndex('reports', 'by-owner-project', [scope, projectId])
    : await db.getAllFromIndex('reports', 'by-owner', scope)

  return reports
    .map(stored => {
      const report = fromStoredReport(stored)
      return {
        id: report.id,
        name: report.name,
        updatedAt: report.updatedAt,
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteReport(
  id: string,
  scope = getStorageScope(),
): Promise<void> {
  const db = await getDB()
  await db.delete('reports', scopedStorageKey(scope, id))
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
  const reports = await db.getAllFromIndex(
    'reports',
    'by-owner-project',
    [scope, projectId],
  )
  const tx = db.transaction('reports', 'readwrite')

  for (const report of reports) {
    await tx.store.delete(report.id)
  }

  await tx.done
}

export async function copyReportsToProject(
  sourceProjectId: string,
  destinationProjectId: string,
  sourceScope = getStorageScope(),
  destinationScope = getStorageScope(),
  regenerateIds = false,
): Promise<void> {
  const reports = await loadReportsForProject(sourceProjectId, sourceScope)
  await Promise.all(Object.values(reports).map((report) => {
    const id = regenerateIds ? createEntityId() : report.id
    return saveReport({
      ...report,
      id,
      projectId: destinationProjectId,
      updatedAt: new Date().toISOString(),
    }, destinationScope)
  }))
}

export async function replaceReportsForProject(
  projectId: string,
  reports: Record<string, Report>,
  scope = getStorageScope(),
): Promise<void> {
  const existing = await loadReportsForProject(projectId, scope)
  const normalized = Object.fromEntries(
    Object.entries(reports).map(([id, report]) => [
      id,
      { ...report, id, projectId },
    ]),
  )
  await saveAllReports(normalized, scope)
  await Promise.all(
    Object.keys(existing)
      .filter(id => !normalized[id])
      .map(id => deleteReport(id, scope)),
  )
}

function fromStoredReport(
  stored: import('./dbCore').TableCanvasDB['reports']['value'],
): Report {
  const report = { ...stored } as typeof stored & {
    entityId?: string
    ownerId?: string
  }
  delete report.entityId
  delete report.ownerId
  return {
    ...report,
    id: stored.entityId ?? stored.id,
  }
}

function createEntityId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `report_${Date.now()}_${Math.random().toString(36).slice(2)}`
}
