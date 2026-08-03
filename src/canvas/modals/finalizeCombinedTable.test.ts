import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import { beginTableOperation } from '@/state/tableOperationCoordinator'
import { finalizeCombinedTable } from './finalizeCombinedTable'

const mocks = vi.hoisted(() => ({
  ensureTableMaterialized: vi.fn(),
  dropTable: vi.fn(),
  waitForTableOperation: vi.fn(),
}))

vi.mock('@/engine/materializationService', () => ({
  ensureTableMaterialized: mocks.ensureTableMaterialized,
}))
vi.mock('@/engine/EngineAdapter', () => ({
  getEngine: () => ({ dropTable: mocks.dropTable }),
}))
vi.mock('@/state/tableOperationCoordinator', async () => {
  const actual = await vi.importActual<typeof import('@/state/tableOperationCoordinator')>(
    '@/state/tableOperationCoordinator',
  )
  return {
    ...actual,
    waitForTableOperation: mocks.waitForTableOperation,
  }
})

beforeEach(() => {
  useTableRuntimeStore.getState().resetRuntime()
  vi.clearAllMocks()
  mocks.waitForTableOperation.mockResolvedValue(undefined)
  mocks.dropTable.mockResolvedValue(undefined)
  mocks.ensureTableMaterialized.mockResolvedValue({
    status: 'computed',
    tableId: 'joined',
    rowCount: 10,
  })
})

describe('finalizeCombinedTable', () => {
  it('waits for upstream tables then marks the result ready', async () => {
    const generation = beginTableOperation('joined', 'waiting')
    await finalizeCombinedTable('joined', generation, 'guest', ['left', 'right'])

    expect(mocks.waitForTableOperation).toHaveBeenCalledWith('left')
    expect(mocks.waitForTableOperation).toHaveBeenCalledWith('right')
    expect(mocks.ensureTableMaterialized).toHaveBeenCalledWith('joined')
    expect(useTableRuntimeStore.getState().cacheInfo.joined).toMatchObject({
      phase: 'ready',
      isComputing: false,
    })
  })

  it('keeps an actionable error node when the row limit is exceeded', async () => {
    mocks.ensureTableMaterialized.mockResolvedValue({
      status: 'computed',
      tableId: 'joined',
      rowCount: 5_000_001,
    })
    const generation = beginTableOperation('joined', 'waiting')
    await finalizeCombinedTable('joined', generation, 'google', ['left', 'right'])

    expect(mocks.dropTable).toHaveBeenCalledWith('joined')
    expect(useTableRuntimeStore.getState().cacheInfo.joined).toMatchObject({
      phase: 'error',
      isDirty: true,
    })
    expect(useTableRuntimeStore.getState().cacheInfo.joined?.error).toMatch(/row/i)
  })
})
