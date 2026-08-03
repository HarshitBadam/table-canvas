import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectNode } from '@/types'
import type { Report } from '@/report/types'
import type { ProjectSnapshot } from './dbCore'
import { getDB } from './dbTestSupport'
import { createMockProject } from './syncServiceTestSupport'

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

vi.mock('@/api/projects.api', () => api)

beforeEach(() => {
  vi.clearAllMocks()
  window.dispatchEvent(new Event('online'))
})

function node(id: string, updatedAt = '2026-01-01T00:00:00.000Z'): ProjectNode {
  return {
    id,
    kind: 'source_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    plan: { fileRef: '', fileName: '', fileType: 'csv', inferredSchemaVersion: 1 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  }
}

function report(updatedAt: string, name: string): Report {
  return {
    id: 'report_1',
    projectId: 'project-1',
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  }
}

function snapshot(
  nodes: Record<string, ProjectNode>,
  reports: Record<string, Report> = {},
): ProjectSnapshot {
  return { name: 'Quarterly', nodes, edges: {}, patches: {}, reports }
}

function serverProject(snapshotAt: ProjectSnapshot, revision: number) {
  return { ...createMockProject('project-1', snapshotAt.name), ...snapshotAt, revision }
}

/** A queued save at `revision`, with the last acknowledged snapshot as its merge base. */
async function queueSave(
  scopeName: string,
  local: ProjectSnapshot,
  revision: number,
  base: ProjectSnapshot | null,
) {
  const db = await getDB()
  const scope = db.accountStorageScope(scopeName)
  db.setStorageScope(scope)
  const syncBase = await import('./projectSyncBase')
  if (base) await syncBase.putProjectSyncBase('project-1', revision, base, scope)
  await db.saveProject(
    'project-1',
    local.name,
    local.nodes,
    local.edges,
    {},
    { revision },
    scope,
  )
  await db.enqueueProjectSave('project-1', local, revision, scope)
  return {
    db,
    scope,
    syncBase,
    sync: await import('./syncService'),
    ApiError: (await import('@/api/client')).ApiError,
  }
}

function acceptSave() {
  api.updateProject.mockImplementation((
    id: string,
    data: { name: string; expectedRevision: number },
  ) => ({
    ...createMockProject(id, data.name),
    revision: data.expectedRevision + 1,
  }))
}

async function conflictCopyName(
  db: Awaited<ReturnType<typeof getDB>>,
  scope: string,
): Promise<string | undefined> {
  const projects = await db.listProjects(scope)
  return projects.find(project => project.id !== 'project-1')?.name
}

describe('save conflicts resolved by merging', () => {
  it('merges a 409 and retries the save with the server revision', async () => {
    const local = snapshot(
      { node_1: node('node_1'), node_2: node('node_2') },
      { report_1: report('2026-02-03T00:00:00.000Z', 'Local report') },
    )
    const { db, scope, syncBase, sync, ApiError } = await queueSave(
      'merge-user',
      local,
      4,
      snapshot(
        { node_1: node('node_1') },
        { report_1: report('2026-02-01T00:00:00.000Z', 'Base report') },
      ),
    )
    api.getProject.mockResolvedValue(serverProject(
      snapshot(
        { node_1: node('node_1'), node_3: node('node_3') },
        { report_1: report('2026-02-02T00:00:00.000Z', 'Server report') },
      ),
      5,
    ))
    acceptSave()
    api.updateProject.mockRejectedValueOnce(new ApiError('Conflict', 409))
    const merges: unknown[] = []
    sync.setProjectMergeHandler(event => merges.push(event))

    await sync.flushProjectSaveWithSync('project-1', scope)

    expect(api.updateProject).toHaveBeenCalledTimes(2)
    const retried = api.updateProject.mock.calls[1][1]
    expect(retried.expectedRevision).toBe(5)
    expect(Object.keys(retried.nodes)).toEqual(['node_1', 'node_2', 'node_3'])
    expect(retried.reports.report_1.name).toBe('Local report')
    expect(merges).toEqual([{
      projectId: 'project-1',
      recoveredReportIds: ['report_1__recovered'],
      droppedEdgeIds: [],
    }])
    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
    const reloaded = await db.loadProject('project-1', scope)
    expect(reloaded).toMatchObject({ revision: 6 })
    expect(Object.keys(reloaded?.nodes ?? {})).toEqual(['node_1', 'node_2', 'node_3'])
    expect(await syncBase.getProjectSyncBase('project-1', scope)).toMatchObject({
      revision: 6,
      snapshot: { nodes: { node_2: { id: 'node_2' } } },
    })
    sync.setProjectMergeHandler(null)
  })

  it('records the acknowledged payload as the base for the next merge', async () => {
    const local = snapshot({ node_1: node('node_1') })
    const { db, scope, syncBase, sync } = await queueSave('base-user', local, 1, null)
    acceptSave()

    await sync.flushProjectSaveWithSync('project-1', scope)

    expect(await syncBase.getProjectSyncBase('project-1', scope)).toMatchObject({
      projectId: 'project-1',
      revision: 2,
      snapshot: local,
    })
    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
  })

  it('falls back to a conflict copy when no base snapshot was captured', async () => {
    const { db, scope, sync, ApiError } = await queueSave(
      'no-base-user',
      snapshot({ node_1: node('node_1') }),
      4,
      null,
    )
    api.getProject.mockResolvedValue(serverProject(snapshot({}), 5))
    api.updateProject.mockRejectedValue(new ApiError('Conflict', 409))
    const merges: unknown[] = []
    sync.setProjectMergeHandler(event => merges.push(event))

    await expect(sync.flushProjectSaveWithSync('project-1', scope))
      .rejects.toMatchObject({ statusCode: 409 })

    expect(api.updateProject).toHaveBeenCalledTimes(1)
    expect(await conflictCopyName(db, scope)).toBe('Quarterly (conflict copy)')
    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
    expect(merges).toEqual([])
    sync.setProjectMergeHandler(null)
  })

  it('falls back to a conflict copy when the merged project exceeds server limits', async () => {
    const nodes = Object.fromEntries(
      Array.from({ length: 5001 }, (_, index) => [`node_${index}`, node(`node_${index}`)]),
    )
    const { db, scope, sync, ApiError } = await queueSave(
      'limits-user',
      snapshot(nodes),
      4,
      snapshot({}),
    )
    api.getProject.mockResolvedValue(serverProject(snapshot({}), 5))
    api.updateProject.mockRejectedValue(new ApiError('Conflict', 409))

    await expect(sync.flushProjectSaveWithSync('project-1', scope))
      .rejects.toMatchObject({ statusCode: 409 })

    expect(api.updateProject).toHaveBeenCalledTimes(1)
    expect(await conflictCopyName(db, scope)).toBe('Quarterly (conflict copy)')
    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
  })

  it('gives up after three attempts and keeps the conflict copy safety net', async () => {
    const { db, scope, sync, ApiError } = await queueSave(
      'capped-user',
      snapshot({ node_1: node('node_1') }),
      4,
      snapshot({}),
    )
    api.getProject.mockResolvedValue(serverProject(snapshot({ node_2: node('node_2') }), 5))
    api.updateProject.mockRejectedValue(new ApiError('Conflict', 409))

    await expect(sync.flushProjectSaveWithSync('project-1', scope))
      .rejects.toMatchObject({ statusCode: 409 })

    expect(api.updateProject).toHaveBeenCalledTimes(3)
    expect(await conflictCopyName(db, scope)).toBe('Quarterly (conflict copy)')
  })
})

describe('saves against a project deleted elsewhere', () => {
  it('preserves a conflict copy and clears the phantom original on a 404', async () => {
    const local = snapshot({ node_1: node('node_1') })
    const { db, scope, syncBase, sync, ApiError } = await queueSave(
      'deleted-elsewhere-user',
      local,
      4,
      snapshot({}),
    )
    api.updateProject.mockRejectedValue(new ApiError('Project not found', 404))

    await expect(sync.flushProjectSaveWithSync('project-1', scope))
      .rejects.toMatchObject({ statusCode: 404 })

    expect(api.updateProject).toHaveBeenCalledTimes(1)
    expect(await conflictCopyName(db, scope)).toBe('Quarterly (conflict copy)')
    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
    expect(await db.loadProject('project-1', scope)).toBeNull()
    expect(await syncBase.getProjectSyncBase('project-1', scope)).toBeNull()
    const remaining = await db.listProjects(scope)
    expect(remaining.some(project => project.id === 'project-1')).toBe(false)
  })
})

describe('rate limited saves', () => {
  it('waits for the advertised delay and retries the same payload', async () => {
    const local = snapshot({ node_1: node('node_1') })
    const { db, scope, sync, ApiError } = await queueSave('throttled-user', local, 4, null)
    acceptSave()
    api.updateProject.mockRejectedValueOnce(new ApiError('Slow down', 429, undefined, 0))

    await sync.flushProjectSaveWithSync('project-1', scope)

    expect(api.getProject).not.toHaveBeenCalled()
    expect(api.updateProject).toHaveBeenCalledTimes(2)
    expect(api.updateProject.mock.calls[1][1]).toMatchObject({ expectedRevision: 4 })
    expect(await db.getProjectSyncOperation('project-1', scope)).toBeNull()
  })

  it('keeps the save queued when the rate limit outlasts every attempt', async () => {
    const { db, scope, sync, ApiError } = await queueSave(
      'throttled-out-user',
      snapshot({ node_1: node('node_1') }),
      4,
      null,
    )
    api.updateProject.mockRejectedValue(new ApiError('Slow down', 429, undefined, 0))
    const { isRetryableRemoteDeferral } = await import('./projectCreateReconciliation')

    const error = await sync.flushProjectSaveWithSync('project-1', scope).catch(
      (thrown: unknown) => thrown,
    )

    expect(api.updateProject).toHaveBeenCalledTimes(3)
    expect(isRetryableRemoteDeferral(error)).toBe(true)
    expect(await db.getProjectSyncOperation('project-1', scope)).not.toBeNull()
    expect(await conflictCopyName(db, scope)).toBeUndefined()
  })

  it('clamps an implausible Retry-After and defaults when the header is absent', async () => {
    const { ApiError } = await import('@/api/client')
    const { retryAfterDelayMs } = await import('./projectSaveConflict')

    expect(retryAfterDelayMs(new ApiError('Slow down', 429, undefined, 2))).toBe(2000)
    expect(retryAfterDelayMs(new ApiError('Slow down', 429, undefined, 900))).toBe(5000)
    expect(retryAfterDelayMs(new ApiError('Slow down', 429))).toBe(1000)
  })
})
