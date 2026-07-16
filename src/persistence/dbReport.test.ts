import { describe, expect, it } from 'vitest'
import { createMockReport, getDB } from './dbTestSupport'

describe('Report Operations', () => {
  it('saves and loads a report', async () => {
    const db = await getDB()
    await db.saveReport(createMockReport('report_1', 'Monthly Report'))
    const loaded = await db.loadReport('report_1')
    expect(loaded).not.toBeNull()
    expect(loaded?.name).toBe('Monthly Report')
    expect(loaded?.tiptapContent?.content).toHaveLength(1)
  })

  it('returns null for non-existent report', async () => {
    const db = await getDB()
    expect(await db.loadReport('non-existent')).toBeNull()
  })

  it('lists reports', async () => {
    const db = await getDB()
    await db.saveReport(createMockReport('r1', 'Report 1'))
    await new Promise(resolve => setTimeout(resolve, 10))
    await db.saveReport(createMockReport('r2', 'Report 2'))
    expect(await db.listReports()).toHaveLength(2)
  })

  it('deletes a report', async () => {
    const db = await getDB()
    await db.saveReport(createMockReport('to-delete', 'Delete Me'))
    expect(await db.loadReport('to-delete')).not.toBeNull()
    await db.deleteReport('to-delete')
    expect(await db.loadReport('to-delete')).toBeNull()
  })

  it('loads all reports', async () => {
    const db = await getDB()
    await db.saveReport(createMockReport('r1', 'Report 1'))
    await db.saveReport(createMockReport('r2', 'Report 2'))
    await db.saveReport(createMockReport('r3', 'Report 3'))
    const reports = await db.loadAllReports()
    expect(Object.keys(reports)).toHaveLength(3)
    expect(reports.r1.name).toBe('Report 1')
    expect(reports.r2.name).toBe('Report 2')
    expect(reports.r3.name).toBe('Report 3')
  })

  it('loads only reports owned by the requested project', async () => {
    const db = await getDB()
    await db.saveReport({ ...createMockReport('p1-report', 'Project 1'), projectId: 'project-1' })
    await db.saveReport({ ...createMockReport('p2-report', 'Project 2'), projectId: 'project-2' })
    const reports = await db.loadReportsForProject('project-1')
    expect(Object.keys(reports)).toEqual(['p1-report'])
  })

  it('bulk saves reports', async () => {
    const db = await getDB()
    await db.saveAllReports({
      r1: createMockReport('r1', 'Bulk 1'),
      r2: createMockReport('r2', 'Bulk 2'),
    })
    expect(Object.keys(await db.loadAllReports())).toHaveLength(2)
  })

  it('deletes only reports scoped to a deleted project', async () => {
    const db = await getDB()
    await db.saveReport({ ...createMockReport('delete-me', 'Delete'), projectId: 'project-1' })
    await db.saveReport({ ...createMockReport('keep-me', 'Keep'), projectId: 'project-2' })

    await db.deleteReportsForProject('project-1')

    expect(await db.loadReport('delete-me')).toBeNull()
    expect(await db.loadReport('keep-me')).not.toBeNull()
  })
})
