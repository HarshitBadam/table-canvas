import type { Report } from '@/report/types'
import type { ProjectWithSync } from './projectSync'
import {
  loadProject as loadProjectLocal,
  saveProject as saveProjectLocal,
} from './db'
import { replaceReportsForProject } from './reportStorage'
import {
  getStorageScope,
  isCloudStorageScope,
} from './storageScope'
import { isNetworkOnline } from './syncState'
import { promoteLocalProject } from './localProjectPromotion'

export async function importProjectWithSync(
  project: Omit<
    ProjectWithSync,
    'id' | 'isLocalOnly' | 'needsSync' | 'revision' | 'reports'
  > & { reports?: Record<string, Report> | Report[] },
): Promise<ProjectWithSync> {
  const reports = Object.fromEntries(
    (Array.isArray(project.reports)
      ? project.reports.map(report => [report.id, report] as const)
      : Object.entries(project.reports ?? {})),
  )
  const scope = getStorageScope()
  const result = {
    ...project,
    reports,
    id: createLocalId(),
    isLocalOnly: true,
    needsSync: true,
    revision: 0,
  }
  await saveProjectLocal(
    result.id,
    result.name,
    result.nodes,
    result.edges,
    result.patches,
  )
  await replaceReportsForProject(result.id, reports, scope)
  if (isNetworkOnline() && isCloudStorageScope()) {
    try {
      const promotion = await promoteLocalProject(result.id, scope, scope)
      if (promotion) {
        const promoted = await loadProjectLocal(
          promotion.destinationProjectId,
          scope,
        )
        if (promoted) {
          return {
            ...promoted,
            patches: project.patches,
            reports: Object.fromEntries(Object.entries(reports).map(([id, report]) => [
              id,
              { ...report, projectId: promotion.destinationProjectId },
            ])),
            isLocalOnly: false,
            needsSync: false,
            revision: promoted.revision ?? 0,
          }
        }
      }
    } catch (error) {
      console.error('[Sync] Imported project is safely queued for retry:', error)
    }
  }
  return result
}

function createLocalId(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `local_${suffix}`
}
