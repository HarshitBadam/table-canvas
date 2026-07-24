import { describe, expect, it } from 'vitest'
import { createMockReport, getDB } from './dbTestSupport'

describe('storage ownership scopes', () => {
  it('isolates projects, files, and reports with identical public IDs', async () => {
    const db = await getDB()
    const accountA = db.accountStorageScope('account-a')
    const accountB = db.accountStorageScope('account-b')

    db.setStorageScope(accountA)
    await db.saveProject('same-project', 'Account A', {}, {}, {})
    await db.saveFile(
      'same-file',
      'a.csv',
      'text/csv',
      new TextEncoder().encode('a').buffer,
    )
    await db.saveReport({
      ...createMockReport('same-report', 'Report A'),
      projectId: 'same-project',
    })

    db.setStorageScope(accountB)
    await db.saveProject('same-project', 'Account B', {}, {}, {})
    await db.saveFile(
      'same-file',
      'b.csv',
      'text/csv',
      new TextEncoder().encode('b').buffer,
    )
    await db.saveReport({
      ...createMockReport('same-report', 'Report B'),
      projectId: 'same-project',
    })

    expect((await db.loadProject('same-project'))?.name).toBe('Account B')
    expect(new TextDecoder().decode(await db.loadFile('same-file') ?? undefined)).toBe('b')
    expect((await db.loadReport('same-report'))?.name).toBe('Report B')

    db.setStorageScope(accountA)
    expect((await db.loadProject('same-project'))?.name).toBe('Account A')
    expect(new TextDecoder().decode(await db.loadFile('same-file') ?? undefined)).toBe('a')
    expect((await db.loadReport('same-report'))?.name).toBe('Report A')
  })

  it('exposes legacy unscoped records only to the guest workspace', async () => {
    const db = await getDB()
    const raw = await db.getDB()
    await raw.put('projects', {
      id: 'legacy-project',
      name: 'Legacy guest work',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    db.setStorageScope(db.accountStorageScope('signed-user'))
    expect(await db.loadProject('legacy-project')).toBeNull()

    db.setStorageScope(db.GUEST_STORAGE_SCOPE)
    expect((await db.loadProject('legacy-project'))?.name).toBe('Legacy guest work')
  })

  it('re-keys reports when a guest project is promoted', async () => {
    const db = await getDB()
    const account = db.accountStorageScope('promoted-user')
    db.setStorageScope(db.GUEST_STORAGE_SCOPE)
    await db.saveReport({
      ...createMockReport('report-1', 'Guest report'),
      projectId: 'local-project',
    })

    await db.copyReportsToProject(
      'local-project',
      'server-project',
      db.GUEST_STORAGE_SCOPE,
      account,
    )
    await db.deleteReportsForProject('local-project', db.GUEST_STORAGE_SCOPE)

    expect(await db.loadReportsForProject('local-project')).toEqual({})
    db.setStorageScope(account)
    expect((await db.loadReportsForProject('server-project'))['report-1']?.name)
      .toBe('Guest report')
  })
})
