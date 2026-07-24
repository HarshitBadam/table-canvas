import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Report } from './types'
import {
  GUEST_STORAGE_SCOPE,
  setStorageScope,
} from '@/persistence/storageScope'

const database = vi.hoisted(() => ({
  saveReport: vi.fn<(report: Report, scope?: string) => Promise<void>>(),
  deleteReport: vi.fn<(id: string) => Promise<void>>(),
  loadAllReports: vi.fn<() => Promise<Record<string, Report>>>(),
}))

vi.mock('@/persistence/db', () => database)

import { useReportStore } from './reportStore'

function report(id: string, projectId?: string): Report {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    id,
    projectId,
    name: id,
    tiptapContent: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: id }] }],
    },
    createdAt: now,
    updatedAt: now,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  setStorageScope(GUEST_STORAGE_SCOPE)
  database.saveReport.mockResolvedValue()
  database.deleteReport.mockResolvedValue()
  database.loadAllReports.mockResolvedValue({})
  useReportStore.getState().reset()
})

afterEach(() => {
  useReportStore.getState().reset()
  vi.useRealTimers()
})

describe('report store persistence lifecycle', () => {
  it('loads only the active project and migrates unscoped legacy reports once', async () => {
    database.loadAllReports.mockResolvedValue({
      current: report('current', 'project-1'),
      other: report('other', 'project-2'),
      legacy: report('legacy'),
    })

    await useReportStore.getState().initializeProject('project-1')

    expect(Object.keys(useReportStore.getState().reports).sort()).toEqual([
      'current',
      'legacy',
    ])
    expect(useReportStore.getState().reports.legacy.projectId).toBe('project-1')
    expect(database.saveReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'legacy', projectId: 'project-1' }),
    )
  })

  it('cancels a pending create save when the report is deleted', async () => {
    await useReportStore.getState().initializeProject('project-1')
    const id = useReportStore.getState().addReport('Temporary')

    useReportStore.getState().deleteReport(id)
    await vi.advanceTimersByTimeAsync(600)

    expect(database.saveReport).not.toHaveBeenCalled()
    expect(database.deleteReport).toHaveBeenCalledWith(id)
    expect(useReportStore.getState().reports[id]).toBeUndefined()
  })

  it('flushes only the latest debounced version before export or project switch', async () => {
    await useReportStore.getState().initializeProject('project-1')
    const id = useReportStore.getState().addReport('Draft')
    useReportStore.getState().updateReport(id, { name: 'Final name' })

    await useReportStore.getState().flushSaves()

    expect(database.saveReport).toHaveBeenCalledTimes(1)
    expect(database.saveReport).toHaveBeenCalledWith(
      expect.objectContaining({ id, name: 'Final name', projectId: 'project-1' }),
      GUEST_STORAGE_SCOPE,
    )
  })

  it('duplicates report content without sharing mutable JSON', async () => {
    await useReportStore.getState().initializeProject('project-1')
    const originalId = useReportStore.getState().addReport('Original')
    const copyId = useReportStore.getState().duplicateReport(originalId)

    expect(copyId).not.toBeNull()
    const original = useReportStore.getState().reports[originalId]
    const copy = useReportStore.getState().reports[copyId!]
    expect(copy.name).toBe('Original (copy)')
    expect(copy.tiptapContent).toEqual(original.tiptapContent)
    expect(copy.tiptapContent).not.toBe(original.tiptapContent)
  })
})
