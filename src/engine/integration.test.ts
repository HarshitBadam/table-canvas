/**
 * Integration tests for the reactive derived tables system.
 * Tests the interaction between dependency graph, dirty propagation,
 * and the project store.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '@/state/projectStore'
import { getComputationOrder } from './dependencyGraph'
import type { TableSchema, SourceTableNode, DerivedTableNode } from '@/lib/types'

// ============================================================================
// Test Fixtures
// ============================================================================

const sampleSchema: TableSchema = {
  columns: [
    { id: 'col1', name: 'ID', type: 'string', nullable: false },
    { id: 'col2', name: 'Value', type: 'number', nullable: true },
  ],
  rowCount: 100,
}

// ============================================================================
// Store Setup Helpers
// ============================================================================

function resetStore() {
  useProjectStore.setState({
    projectId: 'test-project',
    projectName: 'Test Project',
    nodes: {},
    edges: {},
    patches: {},
    selectedNodeId: null,
    selectedEdgeId: null,
    history: { past: [], future: [] },
  })
}

// ============================================================================
// Dirty Propagation Tests
// ============================================================================

describe('Dirty Propagation', () => {
  beforeEach(() => {
    resetStore()
  })

  it('should mark downstream nodes dirty when source table changes', () => {
    const store = useProjectStore.getState()

    // Create A -> B -> C chain
    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
      schema: sampleSchema,
    })

    const tableCId = store.addDerivedTable({
      name: 'Table C',
      transformDef: {
        type: 'filter',
        sourceTableId: tableBId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableBId],
      schema: sampleSchema,
    })

    // Clear dirty flags initially set
    store.updateCacheInfo(tableBId, { isDirty: false })
    store.updateCacheInfo(tableCId, { isDirty: false })

    // Verify clean state
    let state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBeFalsy()
    expect((state.nodes[tableCId] as DerivedTableNode).cacheInfo?.isDirty).toBeFalsy()

    // Simulate editing Table A (this calls markNodeAndDescendantsDirty internally)
    store.setCellValue(tableAId, 'row_1', 'col1', 'new value')

    // Both B and C should now be dirty
    state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
    expect((state.nodes[tableCId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
  })

  it('should propagate dirty to all branches', () => {
    const store = useProjectStore.getState()

    // Create:
    //     A
    //    / \
    //   B   C
    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    const tableCId = store.addDerivedTable({
      name: 'Table C',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    // Clear dirty flags
    store.updateCacheInfo(tableBId, { isDirty: false })
    store.updateCacheInfo(tableCId, { isDirty: false })

    // Edit A
    store.setCellValue(tableAId, 'row_1', 'col1', 'changed')

    // Both B and C should be dirty
    const state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
    expect((state.nodes[tableCId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
  })

  it('should handle diamond dependency pattern', () => {
    const store = useProjectStore.getState()

    // Create diamond:
    //     A
    //    / \
    //   B   C
    //    \ /
    //     D
    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    const tableCId = store.addDerivedTable({
      name: 'Table C',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    const tableDId = store.addDerivedTable({
      name: 'Table D',
      transformDef: {
        type: 'join',
        leftTableId: tableBId,
        rightTableId: tableCId,
        joinType: 'inner',
        leftKey: 'col1',
        rightKey: 'col1',
      },
      upstreamNodeIds: [tableBId, tableCId],
    })

    // Clear dirty flags
    store.updateCacheInfo(tableBId, { isDirty: false })
    store.updateCacheInfo(tableCId, { isDirty: false })
    store.updateCacheInfo(tableDId, { isDirty: false })

    // Edit A - should cascade to B, C, and D
    store.setCellValue(tableAId, 'row_1', 'col1', 'new')

    const state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
    expect((state.nodes[tableCId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
    expect((state.nodes[tableDId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
  })

  it('should not affect unrelated tables', () => {
    const store = useProjectStore.getState()

    // Create two separate chains: A -> B, X -> Y
    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    const tableXId = store.addSourceTable({
      name: 'Table X',
      fileRef: 'file_x',
      fileName: 'x.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableYId = store.addDerivedTable({
      name: 'Table Y',
      transformDef: {
        type: 'filter',
        sourceTableId: tableXId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableXId],
    })

    // Clear dirty flags
    store.updateCacheInfo(tableBId, { isDirty: false })
    store.updateCacheInfo(tableYId, { isDirty: false })

    // Edit A - should only affect B, not Y
    store.setCellValue(tableAId, 'row_1', 'col1', 'new')

    const state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
    expect((state.nodes[tableYId] as DerivedTableNode).cacheInfo?.isDirty).toBe(false)
  })
})

// ============================================================================
// Cycle Prevention Tests
// ============================================================================

describe('Cycle Prevention', () => {
  beforeEach(() => {
    resetStore()
  })

  it('should detect cycle through wouldCreateCycle in store', () => {
    const store = useProjectStore.getState()

    // Create A -> B
    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    // Get fresh state
    const state = useProjectStore.getState()

    // Note: We need to use the generated IDs, not display names
    const tableBId = Object.keys(state.nodes).find(k => state.nodes[k].name === 'Table B')!
    
    // Trying to add B -> A should create a cycle
    const result = store.wouldCreateCycle(tableBId, tableAId)
    expect(result).toBe(true)
  })

  it('should allow valid non-cyclic connections', () => {
    const store = useProjectStore.getState()

    // Create A -> B
    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    // Create a new source table C
    const tableCId = store.addSourceTable({
      name: 'Table C',
      fileRef: 'file_c',
      fileName: 'c.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    // B -> D (new derived table) should be allowed
    // C -> D should also be allowed (creating a join scenario)
    expect(store.wouldCreateCycle(tableBId, 'new_table_d')).toBe(false)
    expect(store.wouldCreateCycle(tableCId, tableBId)).toBe(false)
  })
})

// ============================================================================
// Computation Order Tests
// ============================================================================

describe('Computation Order', () => {
  beforeEach(() => {
    resetStore()
  })

  it('should compute tables in correct dependency order', () => {
    const store = useProjectStore.getState()

    // Create A -> B -> C
    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    const tableCId = store.addDerivedTable({
      name: 'Table C',
      transformDef: {
        type: 'filter',
        sourceTableId: tableBId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableBId],
    })

    const state = useProjectStore.getState()
    const order = getComputationOrder(tableCId, state.nodes, state.edges)

    // Order should be A, B, C
    expect(order.indexOf(tableAId)).toBeLessThan(order.indexOf(tableBId))
    expect(order.indexOf(tableBId)).toBeLessThan(order.indexOf(tableCId))
    expect(order.length).toBe(3)
  })

  it('should handle join computation order', () => {
    const store = useProjectStore.getState()

    // Create:
    // A --\
    //      +--> C (join)
    // B --/
    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addSourceTable({
      name: 'Table B',
      fileRef: 'file_b',
      fileName: 'b.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableCId = store.addDerivedTable({
      name: 'Table C',
      transformDef: {
        type: 'join',
        leftTableId: tableAId,
        rightTableId: tableBId,
        joinType: 'inner',
        leftKey: 'col1',
        rightKey: 'col1',
      },
      upstreamNodeIds: [tableAId, tableBId],
    })

    const state = useProjectStore.getState()
    const order = getComputationOrder(tableCId, state.nodes, state.edges)

    // Both A and B should come before C
    expect(order.indexOf(tableAId)).toBeLessThan(order.indexOf(tableCId))
    expect(order.indexOf(tableBId)).toBeLessThan(order.indexOf(tableCId))
    expect(order.length).toBe(3)
  })
})

// ============================================================================
// Schema Change Propagation Tests
// ============================================================================

describe('Schema Change Propagation', () => {
  beforeEach(() => {
    resetStore()
  })

  it('should mark downstream dirty when column is added', () => {
    const store = useProjectStore.getState()

    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    // Clear dirty
    store.updateCacheInfo(tableBId, { isDirty: false })

    // Add column to A
    store.addColumn(tableAId, 'NewColumn', 'string')

    const state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
  })

  it('should mark downstream dirty when column is renamed', () => {
    const store = useProjectStore.getState()

    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    // Clear dirty
    store.updateCacheInfo(tableBId, { isDirty: false })

    // Rename column in A
    store.renameColumn(tableAId, 'col1', 'RenamedID')

    const state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
  })
})

// ============================================================================
// Row Operation Propagation Tests
// ============================================================================

describe('Row Operation Propagation', () => {
  beforeEach(() => {
    resetStore()
  })

  it('should mark downstream dirty when row is inserted', () => {
    const store = useProjectStore.getState()

    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    // Clear dirty
    store.updateCacheInfo(tableBId, { isDirty: false })

    // Insert row in A
    store.insertRow(tableAId, 'new_row_id', { col1: 'test', col2: 42 }, 0)

    const state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
  })

  it('should mark downstream dirty when row is deleted', () => {
    const store = useProjectStore.getState()

    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    const tableBId = store.addDerivedTable({
      name: 'Table B',
      transformDef: {
        type: 'filter',
        sourceTableId: tableAId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [tableAId],
    })

    // Clear dirty
    store.updateCacheInfo(tableBId, { isDirty: false })

    // Delete row in A
    store.deleteRow(tableAId, 'row_1')

    const state = useProjectStore.getState()
    expect((state.nodes[tableBId] as DerivedTableNode).cacheInfo?.isDirty).toBe(true)
  })
})

// ============================================================================
// Cache Info Management Tests
// ============================================================================

describe('Cache Info Management', () => {
  beforeEach(() => {
    resetStore()
  })

  it('should update cache info correctly', () => {
    const store = useProjectStore.getState()

    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    // Update cache info
    const timestamp = new Date().toISOString()
    store.updateCacheInfo(tableAId, {
      isDirty: false,
      lastComputedAt: timestamp,
      currentVersionHash: 'abc123',
      lastRowCount: 100,
    })

    const state = useProjectStore.getState()
    const node = state.nodes[tableAId] as SourceTableNode

    expect(node.cacheInfo?.isDirty).toBe(false)
    expect(node.cacheInfo?.lastComputedAt).toBe(timestamp)
    expect(node.cacheInfo?.currentVersionHash).toBe('abc123')
    expect(node.cacheInfo?.lastRowCount).toBe(100)
  })

  it('should clear error with clearNodeError', () => {
    const store = useProjectStore.getState()

    const tableAId = store.addSourceTable({
      name: 'Table A',
      fileRef: 'file_a',
      fileName: 'a.csv',
      fileType: 'csv',
      schema: sampleSchema,
    })

    // Set an error
    store.updateCacheInfo(tableAId, { error: 'Test error' })

    let state = useProjectStore.getState()
    expect((state.nodes[tableAId] as SourceTableNode).cacheInfo?.error).toBe('Test error')

    // Clear the error
    store.clearNodeError(tableAId)

    state = useProjectStore.getState()
    expect((state.nodes[tableAId] as SourceTableNode).cacheInfo?.error).toBeUndefined()
  })
})
