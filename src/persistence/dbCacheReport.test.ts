import { describe, expect, it } from 'vitest'
import { createMockReport, getDB } from './dbTestSupport'

describe('Cache Operations', () => {
  it('saves and loads cache data', async () => {
    const db = await getDB()
    const profileData = {
      columns: [{ columnId: 'col_1', distinctCount: 50, missingCount: 2 }],
      rowCount: 100,
    }
    await db.saveCache('table_123', 'profile', profileData)
    expect(await db.loadCache('table_123', 'profile')).toEqual(profileData)
  })

  it('returns null for non-existent cache', async () => {
    const db = await getDB()
    expect(await db.loadCache('unknown-table', 'profile')).toBeNull()
  })

  it('handles different cache types', async () => {
    const db = await getDB()
    await db.saveCache('table_multi_cache', 'profile', { type: 'profile' })
    await db.saveCache('table_multi_cache', 'slice', { type: 'slice' })
    await db.saveCache('table_multi_cache', 'aggregation', { type: 'agg' })

    const profile = await db.loadCache('table_multi_cache', 'profile')
    const slice = await db.loadCache('table_multi_cache', 'slice')
    const aggregation = await db.loadCache('table_multi_cache', 'aggregation')
    expect((profile as { type: string }).type).toBe('profile')
    expect((slice as { type: string }).type).toBe('slice')
    expect((aggregation as { type: string }).type).toBe('agg')
  })

  it('clears cache for a specific table', async () => {
    const db = await getDB()
    await db.saveCache('table_1', 'profile', { data: 1 })
    await db.saveCache('table_1', 'slice', { data: 2 })
    await db.saveCache('table_2', 'profile', { data: 3 })
    await db.clearTableCache('table_1')

    expect(await db.loadCache('table_1', 'profile')).toBeNull()
    expect(await db.loadCache('table_1', 'slice')).toBeNull()
    expect(await db.loadCache('table_2', 'profile')).toEqual({ data: 3 })
  })
})

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

  it('bulk saves reports', async () => {
    const db = await getDB()
    await db.saveAllReports({
      r1: createMockReport('r1', 'Bulk 1'),
      r2: createMockReport('r2', 'Bulk 2'),
    })
    expect(Object.keys(await db.loadAllReports())).toHaveLength(2)
  })
})
