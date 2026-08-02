import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectNode } from '@/types'
import {
  accountStorageScope,
  GUEST_STORAGE_SCOPE,
  setStorageScope,
} from './storageScope'

const mocks = vi.hoisted(() => ({
  deleteFileWithSync: vi.fn(),
  listProjects: vi.fn(),
  loadProject: vi.fn(),
  isNetworkOnline: vi.fn(),
}))

vi.mock('./fileSync', () => ({
  deleteFileWithSync: mocks.deleteFileWithSync,
}))
vi.mock('./db', () => ({
  listProjects: mocks.listProjects,
  loadProject: mocks.loadProject,
}))
vi.mock('./syncState', () => ({
  isNetworkOnline: mocks.isNetworkOnline,
}))

import {
  flushHistoryFileCleanup,
  queueHistoryFileCleanup,
  retainHistoryFileRefs,
} from './historyFileCleanup'

function sourceNode(id: string, fileRef: string): ProjectNode {
  return {
    id,
    kind: 'source_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    schema: { columns: [], rowCount: 0 },
    plan: {
      fileRef,
      fileName: `${id}.csv`,
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteFileWithSync.mockResolvedValue(undefined)
  mocks.listProjects.mockResolvedValue([])
  mocks.isNetworkOnline.mockReturnValue(true)
})

describe('history file cleanup', () => {
  it('retains a cloud file until no history entry owns it', async () => {
    const scope = accountStorageScope('history-owner')
    setStorageScope(scope)
    queueHistoryFileCleanup(scope, ['cloud-file'])
    retainHistoryFileRefs(scope, ['cloud-file'])

    await flushHistoryFileCleanup({}, scope)
    expect(mocks.deleteFileWithSync).not.toHaveBeenCalled()

    retainHistoryFileRefs(scope, [])
    await flushHistoryFileCleanup({}, scope)
    expect(mocks.deleteFileWithSync).toHaveBeenCalledWith(
      'cloud-file',
      { strictRemote: true },
    )
  })

  it('does not delete a guest file referenced by another local project', async () => {
    setStorageScope(GUEST_STORAGE_SCOPE)
    queueHistoryFileCleanup(GUEST_STORAGE_SCOPE, ['shared-local-file'])
    retainHistoryFileRefs(GUEST_STORAGE_SCOPE, [])
    mocks.listProjects.mockResolvedValue([{ id: 'other-project' }])
    mocks.loadProject.mockResolvedValue({
      id: 'other-project',
      nodes: {
        source: sourceNode('source', 'shared-local-file'),
      },
    })

    await flushHistoryFileCleanup({}, GUEST_STORAGE_SCOPE)

    expect(mocks.deleteFileWithSync).not.toHaveBeenCalled()
  })
})
