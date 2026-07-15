import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceTableNode, TableSchema } from '@/types'

const projectStore = {
  nodes: {} as Record<string, SourceTableNode>,
  edges: {},
  patches: {} as Record<string, unknown>,
  getTableNode: vi.fn(),
  updateCacheInfo: vi.fn(),
}
const dataStore = {
  tableData: {} as Record<string, { rows: unknown[] }>,
  setTableData: vi.fn(),
}
const engine = {
  init: vi.fn(),
  loadTable: vi.fn(),
  getSlice: vi.fn(),
}
const loadFile = vi.fn()

vi.mock('@/state/projectStore', () => ({
  useProjectStore: { getState: () => projectStore },
}))
vi.mock('@/state/dataStore', () => ({
  useDataStore: { getState: () => dataStore },
}))
vi.mock('./EngineAdapter', () => ({ getEngine: () => engine }))
vi.mock('@/persistence/syncService', () => ({
  loadFileWithSync: (...args: unknown[]) => loadFile(...args),
}))
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn((text: string, options: {
      complete: (result: {
        data: Record<string, string>[]
        meta: { fields: string[] }
      }) => void
    }) => {
      const lines = text.split('\n').filter(Boolean)
      const fields = lines[0].split(',')
      options.complete({
        data: lines.slice(1).map((line) =>
          Object.fromEntries(line.split(',').map((value, index) => [
            fields[index],
            value,
          ]))
        ),
        meta: { fields },
      })
    }),
  },
}))
vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: { sheet_to_json: vi.fn() },
}))

import { ensureTableMaterialized } from './materializationService'
import {
  computeSchemaFingerprint,
  computeSourceVersionHash,
} from './cacheUtils'

const schema: TableSchema = {
  columns: [
    { id: 'col_1', name: 'ID', type: 'string', nullable: false },
    { id: 'col_2', name: 'Value', type: 'number', nullable: true },
  ],
  rowCount: 1,
}
const csv = () => new TextEncoder().encode('ID,Value\n1,100').buffer

function sourceNode(cacheInfo: Partial<SourceTableNode['cacheInfo']>): SourceTableNode {
  return {
    id: 'table_1',
    kind: 'source_table',
    name: 'Source',
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: 'file_table_1',
      fileName: 'source.csv',
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
    schema,
    cacheInfo: {
      isDirty: true,
      isComputing: false,
      ...cacheInfo,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  projectStore.nodes = {}
  projectStore.patches = {}
  dataStore.tableData = {}
  projectStore.getTableNode.mockImplementation(
    (id: string) => projectStore.nodes[id],
  )
  engine.init.mockResolvedValue(undefined)
  engine.loadTable.mockResolvedValue(undefined)
  engine.getSlice.mockRejectedValue(new Error('Not in engine'))
  loadFile.mockResolvedValue(csv())
})

describe('generation-safe source materialization', () => {
  it('clears a stale cache error on a valid cache hit', async () => {
    projectStore.nodes.table_1 = sourceNode({
      isDirty: false,
      currentVersionHash: computeSourceVersionHash(
        'table_1',
        'file_table_1',
        'none',
        computeSchemaFingerprint(schema),
      ),
      lastRowCount: 1,
      error: 'Previous load failed',
    })
    engine.getSlice.mockResolvedValue({ rows: [], totalRows: 1 })

    const result = await ensureTableMaterialized('table_1')

    expect(result.status).toBe('cached')
    expect(projectStore.updateCacheInfo).toHaveBeenCalledWith('table_1', {
      isComputing: false,
      error: undefined,
    })
  })

  it('restarts with fresh schema after a change during file loading', async () => {
    let resolveFirstFile!: (value: ArrayBuffer) => void
    loadFile
      .mockReturnValueOnce(new Promise<ArrayBuffer>((resolve) => {
        resolveFirstFile = resolve
      }))
      .mockResolvedValue(csv())
    projectStore.nodes.table_1 = sourceNode({ dataRevision: 1 })

    const materialization = ensureTableMaterialized('table_1')
    await vi.waitFor(() => expect(loadFile).toHaveBeenCalledTimes(1))

    const revisedSchema: TableSchema = {
      ...schema,
      columns: [...schema.columns, {
        id: 'col_3',
        name: 'Computed',
        type: 'number',
        nullable: true,
        isComputed: true,
        formula: '[Value] * 2',
      }],
    }
    projectStore.nodes.table_1.schema = revisedSchema
    projectStore.nodes.table_1.cacheInfo!.dataRevision = 2
    resolveFirstFile(csv())

    expect((await materialization).status).toBe('computed')
    expect(loadFile).toHaveBeenCalledTimes(2)
    expect(engine.loadTable).toHaveBeenCalledTimes(1)
    expect(engine.loadTable).toHaveBeenCalledWith(
      'table_1',
      revisedSchema,
      expect.any(Array),
      undefined,
    )
  })

  it('does not lose a newer request made during an engine write', async () => {
    let resolveFirstWrite!: () => void
    engine.loadTable
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirstWrite = resolve
      }))
      .mockResolvedValue(undefined)
    projectStore.nodes.table_1 = sourceNode({ dataRevision: 1 })

    const firstRequest = ensureTableMaterialized('table_1')
    await vi.waitFor(() => expect(engine.loadTable).toHaveBeenCalledTimes(1))

    projectStore.patches.table_1 = {
      cellPatches: { col_2: { row_0: 999 } },
      insertedRows: [],
      deletedRows: new Set<string>(),
    }
    projectStore.nodes.table_1.cacheInfo!.dataRevision = 2
    const newerRequest = ensureTableMaterialized('table_1')
    resolveFirstWrite()

    const [firstResult, newerResult] = await Promise.all([
      firstRequest,
      newerRequest,
    ])
    expect(newerResult).toEqual(firstResult)
    expect(engine.loadTable).toHaveBeenCalledTimes(2)
    expect(engine.loadTable.mock.calls[1][3]).toEqual(
      projectStore.patches.table_1,
    )
  })
})
