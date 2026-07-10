import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DerivedTableNode, SourceTableNode, TableSchema } from '@/types'

const projectStore = {
  nodes: {} as Record<string, SourceTableNode | DerivedTableNode>,
  edges: {} as Record<string, { id: string; fromNodeId: string; toNodeId: string }>,
  patches: {} as Record<string, unknown>,
  getTableNode: vi.fn(),
  updateCacheInfo: vi.fn(),
  updateTableSchema: vi.fn(),
}
const dataStore = {
  tableData: {} as Record<string, { rows: unknown[] }>,
  setTableData: vi.fn(),
}
const engine = {
  init: vi.fn(),
  loadTable: vi.fn(),
  executeTransform: vi.fn(),
  getSlice: vi.fn(),
}
const loadFile = vi.fn()

vi.mock('@/state/projectStore', () => ({ useProjectStore: { getState: () => projectStore } }))
vi.mock('@/state/dataStore', () => ({ useDataStore: { getState: () => dataStore } }))
vi.mock('./EngineAdapter', () => ({ getEngine: () => engine }))
vi.mock('@/persistence/syncService', () => ({ loadFileWithSync: (...args: unknown[]) => loadFile(...args) }))
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn((text: string, options: {
      complete: (result: { data: Record<string, string>[]; meta: { fields: string[] } }) => void
    }) => {
      const lines = text.split('\n').filter(line => line.trim())
      const fields = lines[0]?.split(',') ?? []
      const data = lines.slice(1).map(line =>
        Object.fromEntries(line.split(',').map((value, index) => [fields[index], value]))
      )
      options.complete({ data, meta: { fields } })
    }),
  },
}))
vi.mock('xlsx', () => ({ read: vi.fn(), utils: { sheet_to_json: vi.fn() } }))

import { ensureTableMaterialized, getTableData } from './materializationService'

const schema: TableSchema = {
  columns: [
    { id: 'col_1', name: 'ID', type: 'string', nullable: false },
    { id: 'col_2', name: 'Value', type: 'number', nullable: true },
  ],
  rowCount: 10,
}

function sourceNode(id: string, cacheInfo: Partial<SourceTableNode['cacheInfo']> = {}): SourceTableNode {
  return {
    id,
    kind: 'source_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: `file_${id}`,
      fileName: `${id}.csv`,
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
    schema,
    cacheInfo: {
      isDirty: false,
      isComputing: false,
      currentVersionHash: 'hash_123',
      lastComputedAt: new Date().toISOString(),
      lastRowCount: 10,
      ...cacheInfo,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function derivedNode(
  id: string,
  upstreamNodeIds: string[],
  cacheInfo: Partial<DerivedTableNode['cacheInfo']> = {},
  nodeSchema?: TableSchema
): DerivedTableNode {
  return {
    id,
    kind: 'derived_table',
    name: id,
    ui: { position: { x: 100, y: 100 } },
    plan: {
      transformDef: {
        type: 'filter',
        sourceTableId: upstreamNodeIds[0] ?? '',
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds,
    },
    schema: nodeSchema,
    cacheInfo: { isDirty: true, isComputing: false, ...cacheInfo },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

const edge = (fromNodeId: string, toNodeId: string) => ({
  id: `edge_${fromNodeId}_${toNodeId}`,
  fromNodeId,
  toNodeId,
  transformType: 'filter',
})
const csv = (contents = 'ID,Value\n1,100') => new TextEncoder().encode(contents).buffer

beforeEach(() => {
  vi.clearAllMocks()
  projectStore.nodes = {}
  projectStore.edges = {}
  projectStore.patches = {}
  dataStore.tableData = {}
  projectStore.getTableNode.mockImplementation((id: string) => projectStore.nodes[id])
  loadFile.mockResolvedValue(null)
  engine.init.mockResolvedValue(undefined)
  engine.loadTable.mockResolvedValue(undefined)
  engine.executeTransform.mockResolvedValue({ schema: { columns: [], rowCount: 10 }, rowCount: 10, preview: [] })
  engine.getSlice.mockResolvedValue({ rows: [], totalRows: 0 })
})

describe('source table materialization', () => {
  it('returns an error for a missing table', async () => {
    const result = await ensureTableMaterialized('missing')
    expect(result.status).toBe('error')
    expect(result.error).toBe('Table not found')
  })

  it('returns an error when the source file is missing', async () => {
    projectStore.nodes.table_1 = sourceNode('table_1', { isDirty: true, currentVersionHash: undefined })
    const result = await ensureTableMaterialized('table_1')
    expect(result.status).toBe('error')
    expect(result.error).toContain('Data file not found')
  })

  it('loads a dirty source table from its file', async () => {
    projectStore.nodes.table_1 = sourceNode('table_1', { isDirty: true, currentVersionHash: undefined })
    loadFile.mockResolvedValue(csv('ID,Value\n1,100\n2,200'))
    engine.getSlice.mockRejectedValue(new Error('Table not found'))
    await ensureTableMaterialized('table_1')
    expect(engine.init).toHaveBeenCalled()
    expect(engine.loadTable).toHaveBeenCalled()
    expect(projectStore.updateCacheInfo).toHaveBeenCalled()
  })

  it('updates cache info after successful materialization', async () => {
    projectStore.nodes.table_1 = sourceNode('table_1', { isDirty: true })
    loadFile.mockResolvedValue(csv())
    engine.getSlice.mockRejectedValue(new Error('Not in engine'))
    await ensureTableMaterialized('table_1')
    expect(projectStore.updateCacheInfo).toHaveBeenCalledWith('table_1', expect.objectContaining({
      isDirty: false,
      isComputing: false,
    }))
  })
})

describe('derived table materialization', () => {
  it('materializes upstream tables first', async () => {
    projectStore.nodes = {
      table_a: sourceNode('table_a', { isDirty: true }),
      table_b: derivedNode('table_b', ['table_a']),
    }
    projectStore.edges = { edge_1: edge('table_a', 'table_b') }
    loadFile.mockResolvedValue(csv())
    engine.getSlice.mockRejectedValue(new Error('Not in engine'))
    await ensureTableMaterialized('table_b')
    expect(engine.loadTable).toHaveBeenCalled()
  })

  it('checks engine state for an up-to-date derived table', async () => {
    projectStore.nodes = {
      table_a: sourceNode('table_a', { isDirty: false, currentVersionHash: 'hash_a' }),
      table_b: derivedNode(
        'table_b',
        ['table_a'],
        { isDirty: false, currentVersionHash: 'hash_b', lastUpstreamHash: 'hash_a', lastRowCount: 10 },
        { columns: [], rowCount: 10 }
      ),
    }
    projectStore.edges = { edge_1: edge('table_a', 'table_b') }
    dataStore.tableData = { table_a: { rows: [{ id: 1 }] }, table_b: { rows: [{ id: 1 }] } }
    engine.getSlice.mockResolvedValue({ rows: [{ id: 1 }], totalRows: 1 })
    loadFile.mockResolvedValue(csv())
    await ensureTableMaterialized('table_b')
    expect(engine.init).toHaveBeenCalled()
  })

  it('propagates upstream errors', async () => {
    projectStore.nodes = {
      table_a: sourceNode('table_a', { isDirty: true }),
      table_b: derivedNode('table_b', ['table_a']),
    }
    projectStore.edges = { edge_1: edge('table_a', 'table_b') }
    const result = await ensureTableMaterialized('table_b')
    expect(result.status).toBe('error')
    expect(result.error).toContain('Upstream table')
  })
})

describe('getTableData', () => {
  it('returns an empty error result for a missing table', async () => {
    const result = await getTableData('missing')
    expect(result.error).toBeDefined()
    expect(result.rows).toHaveLength(0)
    expect(result.totalRows).toBe(0)
  })

  it('returns data after materializing', async () => {
    projectStore.nodes.table_1 = sourceNode('table_1')
    loadFile.mockResolvedValue(csv('ID,Value\n1,100\n2,200'))
    engine.getSlice.mockResolvedValue({ rows: [{ ID: '1' }, { ID: '2' }], totalRows: 2 })
    const result = await getTableData('table_1')
    expect(result.rows).toHaveLength(2)
    expect(result.totalRows).toBe(2)
  })

  it('respects offset and limit', async () => {
    projectStore.nodes.table_1 = sourceNode('table_1')
    loadFile.mockResolvedValue(csv())
    engine.getSlice.mockResolvedValue({ rows: [{ ID: '2', Value: 200 }], totalRows: 10 })
    await getTableData('table_1', 5, 10)
    expect(engine.getSlice).toHaveBeenCalledWith('table_1', 5, 10, schema.columns)
  })
})

describe('materialization concurrency and errors', () => {
  it('deduplicates concurrent requests for the same table', async () => {
    projectStore.nodes.table_1 = sourceNode('table_1', { isDirty: true })
    loadFile.mockResolvedValue(csv())
    engine.init.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)))
    engine.getSlice.mockRejectedValue(new Error('Not found'))
    const results = await Promise.all([
      ensureTableMaterialized('table_1'),
      ensureTableMaterialized('table_1'),
      ensureTableMaterialized('table_1'),
    ])
    expect(results[0]).toEqual(results[1])
    expect(results[1]).toEqual(results[2])
  })

  it('captures engine errors and updates cache info', async () => {
    projectStore.nodes.table_1 = sourceNode('table_1', { isDirty: true })
    loadFile.mockResolvedValue(csv())
    engine.loadTable.mockRejectedValue(new Error('Engine crashed'))
    engine.getSlice.mockRejectedValue(new Error('Not found'))
    const result = await ensureTableMaterialized('table_1')
    expect(result.status).toBe('error')
    expect(result.error).toContain('Engine crashed')
    expect(projectStore.updateCacheInfo).toHaveBeenCalledWith('table_1', expect.objectContaining({
      isComputing: false,
      error: expect.stringContaining('Engine crashed'),
    }))
  })

  it('handles transform execution errors', async () => {
    projectStore.nodes = {
      table_a: sourceNode('table_a', { isDirty: false, currentVersionHash: 'hash_a' }),
      table_b: derivedNode('table_b', ['table_a']),
    }
    projectStore.edges = { edge_1: edge('table_a', 'table_b') }
    dataStore.tableData = { table_a: { rows: [{ id: 1 }] } }
    engine.getSlice.mockResolvedValue({ rows: [{ id: 1 }], totalRows: 1 })
    engine.executeTransform.mockRejectedValue(new Error('Invalid SQL'))
    const result = await ensureTableMaterialized('table_b')
    expect(result.status).toBe('error')
    expect(result.error).toBeDefined()
  })

  it('handles a diamond dependency pattern', async () => {
    projectStore.nodes = {
      a: sourceNode('a'),
      b: derivedNode('b', ['a']),
      c: derivedNode('c', ['a']),
      d: derivedNode('d', ['b', 'c']),
    }
    projectStore.edges = {
      e1: edge('a', 'b'),
      e2: edge('a', 'c'),
      e3: edge('b', 'd'),
      e4: edge('c', 'd'),
    }
    dataStore.tableData = {
      a: { rows: [{ id: 1 }] },
      b: { rows: [{ id: 1 }] },
      c: { rows: [{ id: 1 }] },
    }
    loadFile.mockResolvedValue(csv())
    engine.getSlice.mockResolvedValue({ rows: [{ id: 1 }], totalRows: 1 })
    await ensureTableMaterialized('d')
    expect(engine.init).toHaveBeenCalled()
  })
})
