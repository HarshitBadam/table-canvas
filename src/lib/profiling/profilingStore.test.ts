import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addSource, resetStore } from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'

const ensureTableMaterialized = vi.hoisted(() => vi.fn())
const loadTable = vi.hoisted(() => vi.fn())
const getProfile = vi.hoisted(() => vi.fn())

vi.mock('@/engine/materializationService', () => ({ ensureTableMaterialized }))
vi.mock('@/engine', () => ({
  getEngine: () => ({
    loadTable,
    getProfile,
  }),
}))

import {
  ensureTableInEngine,
  getTableProfileVersion,
  loadProfileForTable,
  useProfilingStore,
} from './profilingStore'

beforeEach(() => {
  resetStore()
  ensureTableMaterialized.mockReset()
  loadTable.mockReset()
  getProfile.mockReset()
  useProfilingStore.setState({
    profiles: {},
    profileVersions: {},
    loading: {},
    loadingVersions: {},
  })
})

describe('ensureTableInEngine', () => {
  it('uses the materialization coordinator for source tables', async () => {
    const tableId = addSource('Source')
    ensureTableMaterialized.mockResolvedValue({
      status: 'cached',
      tableId,
      rowCount: 100,
    })

    await expect(ensureTableInEngine(tableId)).resolves.toBe(true)

    expect(ensureTableMaterialized).toHaveBeenCalledWith(tableId)
    expect(loadTable).not.toHaveBeenCalled()
  })

  it('returns false when coordinated materialization fails', async () => {
    const tableId = addSource('Source')
    ensureTableMaterialized.mockResolvedValue({
      status: 'error',
      tableId,
      error: 'Data unavailable',
    })

    await expect(ensureTableInEngine(tableId)).resolves.toBe(false)
  })
})

describe('profile cache versions', () => {
  it('invalidates a cached profile when dataRevision changes', () => {
    const tableId = addSource('Source')
    const profile = {
      tableId,
      rowCount: 100,
      columns: [],
      phase: 1 as const,
      computedAt: new Date().toISOString(),
    }
    useProfilingStore.getState().setProfile(tableId, profile)
    expect(useProfilingStore.getState().getProfile(tableId)).toBe(profile)

    useProjectStore.getState().updateCacheInfo(tableId, { dataRevision: 1 })

    expect(useProfilingStore.getState().getProfile(tableId)).toBeUndefined()
    expect(useProfilingStore.getState().profiles[tableId]).toBeUndefined()
  })

  it('invalidates a cached profile when updatedAt changes', () => {
    const tableId = addSource('Source')
    const profile = {
      tableId,
      rowCount: 100,
      columns: [],
      phase: 1 as const,
      computedAt: new Date().toISOString(),
    }
    useProfilingStore.getState().setProfile(tableId, profile)
    const node = useProjectStore.getState().getTableNode(tableId)!
    useProjectStore.setState({
      nodes: {
        ...useProjectStore.getState().nodes,
        [tableId]: { ...node, updatedAt: '2099-01-01T00:00:00.000Z' },
      },
    })

    expect(useProfilingStore.getState().getProfile(tableId)).toBeUndefined()
    expect(useProfilingStore.getState().profiles[tableId]).toBeUndefined()
  })

  it('invalidates a cached profile when schema changes without a timestamp change', () => {
    const tableId = addSource('Source')
    const profile = {
      tableId,
      rowCount: 100,
      columns: [],
      phase: 1 as const,
      computedAt: new Date().toISOString(),
    }
    useProfilingStore.getState().setProfile(tableId, profile)
    const node = useProjectStore.getState().getTableNode(tableId)!
    useProjectStore.setState({
      nodes: {
        ...useProjectStore.getState().nodes,
        [tableId]: {
          ...node,
          schema: {
            ...node.schema!,
            columns: node.schema!.columns.map((column, index) =>
              index === 0 ? { ...column, name: 'Renamed ID' } : column,
            ),
          },
        },
      },
    })

    expect(useProfilingStore.getState().getProfile(tableId)).toBeUndefined()
  })

  it('reloads instead of reusing a profile from an older table version', async () => {
    const tableId = addSource('Source')
    const profile = {
      tableId,
      rowCount: 100,
      columns: [],
      phase: 1 as const,
      computedAt: new Date().toISOString(),
    }
    ensureTableMaterialized.mockResolvedValue({
      status: 'cached',
      tableId,
      rowCount: 100,
    })
    getProfile.mockResolvedValue(profile)
    useProfilingStore.getState().setProfile(tableId, profile)
    const oldVersion = getTableProfileVersion(tableId)
    useProjectStore.getState().updateCacheInfo(tableId, { dataRevision: 2 })

    await loadProfileForTable(tableId)

    expect(getProfile).toHaveBeenCalled()
    expect(useProfilingStore.getState().profileVersions[tableId]).not.toBe(oldVersion)
    expect(useProfilingStore.getState().getProfile(tableId)).toEqual(profile)
  })
})
