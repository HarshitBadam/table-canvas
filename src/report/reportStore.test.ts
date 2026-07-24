import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Report } from './types'
import {
  GUEST_STORAGE_SCOPE,
  setStorageScope,
} from '@/persistence/storageScope'

const database = vi.hoisted(() => ({
  saveReport: vi.fn<(report: Report, scope?: string) => Promise<void>>(),
  deleteReport: vi.fn<(id: string, scope?: string) => Promise<void>>(),
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
    expect(database.deleteReport).toHaveBeenCalledWith(id, GUEST_STORAGE_SCOPE)
    expect(useReportStore.getState().reports[id]).toBeUndefined()
  })

  it('restores a report in the UI when its IndexedDB delete fails', async () => {
    database.deleteReport.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await useReportStore.getState().initializeProject('project-1')
    const id = useReportStore.getState().addReport('Keep me')
    await useReportStore.getState().flushSaves()

    useReportStore.getState().deleteReport(id)
    await vi.waitFor(() => {
      expect(useReportStore.getState().reports[id]?.name).toBe('Keep me')
    })

    expect(useReportStore.getState().persistenceStatus).toBe('error')
    consoleError.mockRestore()
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

  it('waits for a save that already left the debounce queue', async () => {
    let finishSave: (() => void) | undefined
    database.saveReport.mockImplementation(
      () => new Promise<void>(resolve => {
        finishSave = resolve
      }),
    )
    await useReportStore.getState().initializeProject('project-1')
    useReportStore.getState().addReport('In flight')
    await vi.advanceTimersByTimeAsync(100)

    let flushed = false
    const flush = useReportStore.getState().flushSaves().then(() => {
      flushed = true
    })
    await Promise.resolve()
    expect(flushed).toBe(false)

    finishSave?.()
    await flush
    expect(flushed).toBe(true)
  })

  it('serializes a newer edit behind an in-flight save', async () => {
    let finishFirstSave: (() => void) | undefined
    database.saveReport.mockImplementationOnce(
      () => new Promise<void>(resolve => {
        finishFirstSave = resolve
      }),
    )
    await useReportStore.getState().initializeProject('project-1')
    const id = useReportStore.getState().addReport('First version')
    await vi.advanceTimersByTimeAsync(100)

    useReportStore.getState().updateReport(id, { name: 'Latest version' })
    const flush = useReportStore.getState().flushSaves()
    await Promise.resolve()
    expect(database.saveReport).toHaveBeenCalledTimes(1)

    finishFirstSave?.()
    await flush
    expect(database.saveReport).toHaveBeenCalledTimes(2)
    expect(database.saveReport.mock.calls[1][0].name).toBe('Latest version')
  })

  it('does not retry a stale snapshot after a newer queued save', async () => {
    let rejectFirstSave: ((error: Error) => void) | undefined
    database.saveReport.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => {
        rejectFirstSave = reject
      }),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await useReportStore.getState().initializeProject('project-1')
    const id = useReportStore.getState().addReport('First version')
    await vi.advanceTimersByTimeAsync(100)

    useReportStore.getState().updateReport(id, { name: 'Latest version' })
    await vi.advanceTimersByTimeAsync(100)
    rejectFirstSave?.(new Error('First write failed'))
    await useReportStore.getState().flushSaves()
    await useReportStore.getState().flushSaves()

    expect(database.saveReport).toHaveBeenCalledTimes(2)
    expect(database.saveReport.mock.calls[1][0].name).toBe('Latest version')
    consoleError.mockRestore()
  })

  it('keeps a failed write pending so a transfer retry can save it', async () => {
    database.saveReport.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
    await useReportStore.getState().initializeProject('project-1')
    useReportStore.getState().addReport('Retry me')

    await expect(useReportStore.getState().flushSaves())
      .rejects.toThrow('IndexedDB unavailable')
    database.saveReport.mockResolvedValue()
    await useReportStore.getState().flushSaves()

    expect(database.saveReport).toHaveBeenCalledTimes(2)
    expect(useReportStore.getState().persistenceStatus).toBe('saved')
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
