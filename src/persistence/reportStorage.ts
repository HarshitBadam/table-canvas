import type { Report } from '@/report/types'
import { getDB } from './dbCore'

export async function saveReport(report: Report): Promise<void> {
  const db = await getDB()
  await db.put('reports', report)
}

export async function loadReport(id: string): Promise<Report | null> {
  const db = await getDB()
  const report = await db.get('reports', id)
  return report ?? null
}

export async function loadAllReports(): Promise<Record<string, Report>> {
  const db = await getDB()
  const reports = await db.getAll('reports')
  const result: Record<string, Report> = {}
  for (const report of reports) {
    result[report.id] = report
  }
  return result
}

export async function listReports(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const db = await getDB()
  const reports = await db.getAllFromIndex('reports', 'by-updated')

  return reports.map(r => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updatedAt,
  })).reverse()
}

export async function deleteReport(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('reports', id)
}

export async function saveAllReports(reports: Record<string, Report>): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('reports', 'readwrite')

  for (const report of Object.values(reports)) {
    await tx.store.put(report)
  }

  await tx.done
}
