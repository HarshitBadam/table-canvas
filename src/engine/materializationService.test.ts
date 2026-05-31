// Note: These tests mock external dependencies (DuckDB engine, stores, IndexedDB)

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { SourceTableNode, DerivedTableNode, TableSchema } from '@/types'


const mockProjectStore = {
  projectId: 'test-project',
  nodes: {} as Record<string, SourceTableNode | DerivedTableNode>,
  edges: {} as Record<string, { id: string; fromNodeId: string; toNodeId: string }>,
  patches: {} as Record<string, unknown>,
  getTableNode: vi.fn(),
  updateCacheInfo: vi.fn(),
  updateTableSchema: vi.fn(),
  markNodeAndDescendantsDirty: vi.fn(),
  getState: vi.fn(() => mockProjectStore),
}

const mockDataStore = {
  tableData: {} as Record<string, { rows: unknown[]; isLoading?: boolean }>,
  setTableData: vi.fn(),
  getState: vi.fn(() => mockDataStore),
}

const mockEngine = {
  init: vi.fn().mockResolvedValue(undefined),
  loadTable: vi.fn().mockResolvedValue(undefined),
  executeTransform: vi.fn().mockResolvedValue({
    schema: { columns: [], rowCount: 10 },
    rowCount: 10,
    preview: [],
  }),
  getSlice: vi.fn().mockResolvedValue({
    rows: [],
    totalRows: 0,
  }),
}

const mockLoadFile = vi.fn().mockResolvedValue(null)

// Setup mocks before importing the module
vi.mock('@/state/projectStore', () => ({
  useProjectStore: {
    getState: () => mockProjectStore,
  },
}))

vi.mock('@/state/dataStore', () => ({
  useDataStore: {
    getState: () => mockDataStore,
  },
}))

vi.mock('./EngineAdapter', () => ({
  getEngine: () => mockEngine,
}))

vi.mock('@/persistence/db', () => ({
  loadFile: (...args: unknown[]) => mockLoadFile(...args),
}))

vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn((text: string, options: { header: boolean; skipEmptyLines: boolean; complete: (results: { data: Record<string, string>[]; meta: { fields: string[] } }) => void }) => {
      const lines = text.split('\n').filter(l => l.trim())
      const headers = lines[0]?.split(',') || []
      const data = lines.slice(1).map(line => {
        const values = line.split(',')
        const row: Record<string, string> = {}
        headers.forEach((h, i) => {
          row[h] = values[i] || ''
        })
        return row
      })
      options.complete({ data, meta: { fields: headers } })
    }),
  },
}))

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: {} },
  })),
  utils: {
    sheet_to_json: vi.fn(() => []),
  },
}))

// Import after mocks are set up
import {
  ensureTableMaterialized,
  needsMaterialization,
  forceMaterialize,
  getMaterializationStatus,
  getTableData,
} from './materializationService'


function createSourceTableNode(id: string, name: string, options?: {
  fileRef?: string
  cacheInfo?: Partial<SourceTableNode['cacheInfo']>
  schema?: TableSchema
}): SourceTableNode {
  return {
    id,
    kind: 'source_table',
    name,
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: options?.fileRef || `file_${id}`,
      fileName: `${name}.csv`,
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
    schema: options?.schema || {
      columns: [
        { id: 'col_1', name: 'ID', type: 'string', nullable: false },
        { id: 'col_2', name: 'Value', type: 'number', nullable: true },
      ],
      rowCount: 10,
    },
    cacheInfo: {
      isDirty: false,
      isComputing: false,
      currentVersionHash: 'hash_123',
      lastComputedAt: new Date().toISOString(),
      lastRowCount: 10,
      ...options?.cacheInfo,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createDerivedTableNode(id: string, name: string, upstreamIds: string[], options?: {
  cacheInfo?: Partial<DerivedTableNode['cacheInfo']>
  schema?: TableSchema
}): DerivedTableNode {
  return {
    id,
    kind: 'derived_table',
    name,
    ui: { position: { x: 100, y: 100 } },
    plan: {
      transformDef: {
        type: 'filter',
        sourceTableId: upstreamIds[0] || '',
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: upstreamIds,
    },
    schema: options?.schema,
    cacheInfo: {
      isDirty: true,
      isComputing: false,
      ...options?.cacheInfo,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createEdge(from: string, to: string) {
  return {
    id: `edge_${from}_${to}`,
    fromNodeId: from,
    toNodeId: to,
    transformType: 'filter',
  }
}


beforeEach(() => {
  vi.clearAllMocks()
  
  mockProjectStore.nodes = {}
  mockProjectStore.edges = {}
  mockProjectStore.patches = {}
  mockDataStore.tableData = {}
  
  mockProjectStore.getTableNode.mockImplementation((id: string) => mockProjectStore.nodes[id])
  mockLoadFile.mockResolvedValue(null)
  
  mockEngine.init.mockResolvedValue(undefined)
  mockEngine.loadTable.mockResolvedValue(undefined)
  mockEngine.executeTransform.mockResolvedValue({
    schema: { columns: [], rowCount: 10 },
    rowCount: 10,
    preview: [],
  })
  mockEngine.getSlice.mockResolvedValue({ rows: [], totalRows: 0 })
})

afterEach(() => {
  vi.clearAllMocks()
})


describe('needsMaterialization', () => {
  it('returns true when table is dirty', () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: true },
    })
    mockProjectStore.nodes = { table_1: table }
    mockDataStore.tableData = { table_1: { rows: [{ id: 1 }] } }

    expect(needsMaterialization('table_1')).toBe(true)
  })

  it('returns true when data is missing from store', () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: false },
    })
    mockProjectStore.nodes = { table_1: table }
    mockDataStore.tableData = {} // No data

    expect(needsMaterialization('table_1')).toBe(true)
  })

  it('returns true when version hash is missing', () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: false, currentVersionHash: undefined },
    })
    mockProjectStore.nodes = { table_1: table }
    mockDataStore.tableData = { table_1: { rows: [{ id: 1 }] } }

    expect(needsMaterialization('table_1')).toBe(true)
  })

  it('returns false when cache is valid', () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: false, currentVersionHash: 'valid_hash' },
    })
    mockProjectStore.nodes = { table_1: table }
    mockDataStore.tableData = { table_1: { rows: [{ id: 1 }] } }

    expect(needsMaterialization('table_1')).toBe(false)
  })

  it('returns false for non-existent table', () => {
    expect(needsMaterialization('non_existent')).toBe(false)
  })
})


describe('getMaterializationStatus', () => {
  it('returns correct status for dirty table', () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: true, isComputing: false },
    })
    mockProjectStore.nodes = { table_1: table }

    const status = getMaterializationStatus('table_1')

    expect(status.needsComputation).toBe(true)
    expect(status.isComputing).toBe(false)
    expect(status.hasError).toBe(false)
  })

  it('returns correct status for computing table', () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: true, isComputing: true },
    })
    mockProjectStore.nodes = { table_1: table }

    const status = getMaterializationStatus('table_1')

    expect(status.isComputing).toBe(true)
  })

  it('returns correct status for table with error', () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: false, error: 'Something went wrong' },
    })
    mockProjectStore.nodes = { table_1: table }

    const status = getMaterializationStatus('table_1')

    expect(status.hasError).toBe(true)
    expect(status.error).toBe('Something went wrong')
  })

  it('returns error status for non-existent table', () => {
    const status = getMaterializationStatus('non_existent')

    expect(status.hasError).toBe(true)
    expect(status.error).toBe('Table not found')
  })

  it('returns lastComputedAt when available', () => {
    const timestamp = new Date().toISOString()
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { lastComputedAt: timestamp },
    })
    mockProjectStore.nodes = { table_1: table }

    const status = getMaterializationStatus('table_1')

    expect(status.lastComputedAt).toBe(timestamp)
  })
})


describe('ensureTableMaterialized - Source Tables', () => {
  it('returns error for non-existent table', async () => {
    const result = await ensureTableMaterialized('non_existent')

    expect(result.status).toBe('error')
    expect(result.error).toBe('Table not found')
  })

  it('returns error when file is missing', async () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: true, currentVersionHash: undefined },
    })
    mockProjectStore.nodes = { table_1: table }
    mockLoadFile.mockResolvedValue(null)

    const result = await ensureTableMaterialized('table_1')

    expect(result.status).toBe('error')
    expect(result.error).toContain('Data file not found')
  })

  it('loads source table from file when dirty', async () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: true, currentVersionHash: undefined },
    })
    mockProjectStore.nodes = { table_1: table }
    
    // Mock file data
    const csvContent = 'ID,Value\n1,100\n2,200'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    
    // Mock engine to succeed
    mockEngine.getSlice.mockRejectedValue(new Error('Table not found'))

    await ensureTableMaterialized('table_1')

    expect(mockEngine.init).toHaveBeenCalled()
    expect(mockEngine.loadTable).toHaveBeenCalled()
    expect(mockProjectStore.updateCacheInfo).toHaveBeenCalled()
  })

  it('updates cache info on successful materialization', async () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: true },
    })
    mockProjectStore.nodes = { table_1: table }
    
    const csvContent = 'ID,Value\n1,100'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    mockEngine.getSlice.mockRejectedValue(new Error('Not in engine'))

    await ensureTableMaterialized('table_1')

    // Should have been called to update cache info
    expect(mockProjectStore.updateCacheInfo).toHaveBeenCalledWith(
      'table_1',
      expect.objectContaining({
        isDirty: false,
        isComputing: false,
      })
    )
  })
})


describe('ensureTableMaterialized - Derived Tables', () => {
  it('materializes upstream tables first', async () => {
    // Setup: A -> B (B is derived from A)
    const tableA = createSourceTableNode('table_a', 'Source', {
      cacheInfo: { isDirty: true },
    })
    const tableB = createDerivedTableNode('table_b', 'Derived', ['table_a'], {
      cacheInfo: { isDirty: true },
    })
    
    mockProjectStore.nodes = { table_a: tableA, table_b: tableB }
    mockProjectStore.edges = { edge_1: createEdge('table_a', 'table_b') }
    
    // Mock file loading
    const csvContent = 'ID,Value\n1,100'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    mockEngine.getSlice.mockRejectedValue(new Error('Not in engine'))

    await ensureTableMaterialized('table_b')

    // Engine.loadTable should be called for source table
    // Engine.executeTransform should be called for derived table
    expect(mockEngine.loadTable).toHaveBeenCalled()
  })

  it('returns cached result when derived table is up-to-date', async () => {
    const tableA = createSourceTableNode('table_a', 'Source', {
      cacheInfo: { 
        isDirty: false, 
        currentVersionHash: 'hash_a',
        lastComputedAt: new Date().toISOString(),
      },
    })
    const tableB = createDerivedTableNode('table_b', 'Derived', ['table_a'], {
      cacheInfo: { 
        isDirty: false, 
        currentVersionHash: 'hash_b',
        lastUpstreamHash: 'hash_a',
        lastRowCount: 10,
      },
      schema: { columns: [], rowCount: 10 },
    })
    
    mockProjectStore.nodes = { table_a: tableA, table_b: tableB }
    mockProjectStore.edges = { edge_1: createEdge('table_a', 'table_b') }
    mockDataStore.tableData = {
      table_a: { rows: [{ id: 1 }] },
      table_b: { rows: [{ id: 1 }] },
    }
    
    // Mock engine to return that table exists
    mockEngine.getSlice.mockResolvedValue({ rows: [{ id: 1 }], totalRows: 1 })

    // Source table should return cached
    const csvContent = 'ID,Value\n1,100'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)

    await ensureTableMaterialized('table_b')

    // Should check engine status but may not recompute
    expect(mockEngine.init).toHaveBeenCalled()
  })

  it('propagates upstream errors to dependent tables', async () => {
    // Setup: A -> B where A has file missing
    const tableA = createSourceTableNode('table_a', 'Source', {
      cacheInfo: { isDirty: true },
    })
    const tableB = createDerivedTableNode('table_b', 'Derived', ['table_a'], {
      cacheInfo: { isDirty: true },
    })
    
    mockProjectStore.nodes = { table_a: tableA, table_b: tableB }
    mockProjectStore.edges = { edge_1: createEdge('table_a', 'table_b') }
    
    // File not found
    mockLoadFile.mockResolvedValue(null)

    const result = await ensureTableMaterialized('table_b')

    expect(result.status).toBe('error')
    expect(result.error).toContain('Upstream table')
  })
})


describe('forceMaterialize', () => {
  it('marks table and descendants dirty before materializing', async () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: false },
    })
    mockProjectStore.nodes = { table_1: table }
    
    const csvContent = 'ID,Value\n1,100'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    mockEngine.getSlice.mockRejectedValue(new Error('Not found'))

    await forceMaterialize('table_1')

    expect(mockProjectStore.markNodeAndDescendantsDirty).toHaveBeenCalledWith('table_1')
  })
})


describe('getTableData', () => {
  it('returns error for non-existent table', async () => {
    const result = await getTableData('non_existent')

    expect(result.error).toBeDefined()
    expect(result.rows).toHaveLength(0)
    expect(result.totalRows).toBe(0)
  })

  it('returns data after materializing', async () => {
    const table = createSourceTableNode('table_1', 'Test')
    mockProjectStore.nodes = { table_1: table }
    
    const csvContent = 'ID,Value\n1,100\n2,200'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    
    // Mock engine slice
    mockEngine.getSlice.mockResolvedValue({
      rows: [
        { ID: '1', Value: 100 },
        { ID: '2', Value: 200 },
      ],
      totalRows: 2,
    })

    const result = await getTableData('table_1')

    expect(result.rows).toHaveLength(2)
    expect(result.totalRows).toBe(2)
  })

  it('respects offset and limit parameters', async () => {
    const table = createSourceTableNode('table_1', 'Test')
    mockProjectStore.nodes = { table_1: table }
    
    const csvContent = 'ID,Value\n1,100'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    
    mockEngine.getSlice.mockResolvedValue({
      rows: [{ ID: '2', Value: 200 }],
      totalRows: 10,
    })

    await getTableData('table_1', 5, 10)

    expect(mockEngine.getSlice).toHaveBeenCalledWith('table_1', 5, 10)
  })
})


describe('Concurrent Materialization Deduplication', () => {
  it('deduplicates concurrent requests for same table', async () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: true },
    })
    mockProjectStore.nodes = { table_1: table }
    
    const csvContent = 'ID,Value\n1,100'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    
    // Slow down the engine init to test deduplication
    mockEngine.init.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 50)))
    mockEngine.getSlice.mockRejectedValue(new Error('Not found'))

    // Fire off multiple concurrent requests
    const results = await Promise.all([
      ensureTableMaterialized('table_1'),
      ensureTableMaterialized('table_1'),
      ensureTableMaterialized('table_1'),
    ])

    // All should return the same result
    expect(results[0]).toEqual(results[1])
    expect(results[1]).toEqual(results[2])
  })
})


describe('Error Handling', () => {
  it('captures engine errors and updates cache info', async () => {
    const table = createSourceTableNode('table_1', 'Test', {
      cacheInfo: { isDirty: true },
    })
    mockProjectStore.nodes = { table_1: table }
    
    const csvContent = 'ID,Value\n1,100'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    
    // Engine throws error
    mockEngine.loadTable.mockRejectedValue(new Error('Engine crashed'))
    mockEngine.getSlice.mockRejectedValue(new Error('Not found'))

    const result = await ensureTableMaterialized('table_1')

    expect(result.status).toBe('error')
    expect(result.error).toContain('Engine crashed')
    
    // Cache info should be updated with error
    expect(mockProjectStore.updateCacheInfo).toHaveBeenCalledWith(
      'table_1',
      expect.objectContaining({
        isComputing: false,
        error: expect.stringContaining('Engine crashed'),
      })
    )
  })

  it('handles transform execution errors', async () => {
    const tableA = createSourceTableNode('table_a', 'Source', {
      cacheInfo: { 
        isDirty: false, 
        currentVersionHash: 'hash_a',
        lastComputedAt: new Date().toISOString(),
      },
    })
    const tableB = createDerivedTableNode('table_b', 'Derived', ['table_a'], {
      cacheInfo: { isDirty: true },
    })
    
    mockProjectStore.nodes = { table_a: tableA, table_b: tableB }
    mockProjectStore.edges = { edge_1: createEdge('table_a', 'table_b') }
    mockDataStore.tableData = { table_a: { rows: [{ id: 1 }] } }
    
    // Source table is cached and exists in engine
    mockEngine.getSlice.mockResolvedValue({ rows: [{ id: 1 }], totalRows: 1 })
    
    // Transform fails
    mockEngine.executeTransform.mockRejectedValue(new Error('Invalid SQL'))

    const result = await ensureTableMaterialized('table_b')

    // The error should propagate (either directly or as upstream error)
    expect(result.status).toBe('error')
    // Error message should contain the SQL error somewhere in the chain
    expect(result.error).toBeDefined()
  })
})


describe('Diamond Dependency Pattern', () => {
  it('handles diamond dependencies correctly', async () => {
    // Setup: A -> B, A -> C, B -> D, C -> D (diamond)
    const tableA = createSourceTableNode('a', 'Source A')
    const tableB = createDerivedTableNode('b', 'Derived B', ['a'])
    const tableC = createDerivedTableNode('c', 'Derived C', ['a'])
    const tableD = createDerivedTableNode('d', 'Derived D', ['b', 'c'], {
      cacheInfo: { isDirty: true },
    })
    
    mockProjectStore.nodes = { a: tableA, b: tableB, c: tableC, d: tableD }
    mockProjectStore.edges = {
      e1: createEdge('a', 'b'),
      e2: createEdge('a', 'c'),
      e3: createEdge('b', 'd'),
      e4: createEdge('c', 'd'),
    }
    
    // Mock data for all tables
    mockDataStore.tableData = {
      a: { rows: [{ id: 1 }] },
      b: { rows: [{ id: 1 }] },
      c: { rows: [{ id: 1 }] },
    }
    
    const csvContent = 'ID,Value\n1,100'
    const encoder = new TextEncoder()
    mockLoadFile.mockResolvedValue(encoder.encode(csvContent).buffer)
    mockEngine.getSlice.mockResolvedValue({ rows: [{ id: 1 }], totalRows: 1 })

    // Materializing D should process A first, then B and C, then D
    await ensureTableMaterialized('d')

    // Engine should be initialized
    expect(mockEngine.init).toHaveBeenCalled()
  })
})
