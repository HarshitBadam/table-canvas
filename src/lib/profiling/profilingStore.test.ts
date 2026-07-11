import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addSource, resetStore } from '@/engine/integrationTestUtils'

const ensureTableMaterialized = vi.hoisted(() => vi.fn())
const loadTable = vi.hoisted(() => vi.fn())

vi.mock('@/engine/materializationService', () => ({ ensureTableMaterialized }))
vi.mock('@/engine', () => ({
  getEngine: () => ({
    loadTable,
    getProfile: vi.fn(),
  }),
}))

import { ensureTableInEngine } from './profilingStore'

beforeEach(() => {
  resetStore()
  ensureTableMaterialized.mockReset()
  loadTable.mockReset()
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
