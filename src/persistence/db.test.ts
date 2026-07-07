/**
 * Unit tests for IndexedDB Persistence Layer
 * Tests project save/load, file operations, cache management, and export/import
 * 
 * Uses fake-indexeddb for browser-like IndexedDB simulation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

// Polyfill for Blob.text() which isn't available in jsdom
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsText(this)
    })
  }
}

// Reset IndexedDB between tests
beforeEach(() => {
  // @ts-expect-error - fake-indexeddb global assignment
  globalThis.indexedDB = new IDBFactory()
})

// Dynamic imports to ensure fresh module state
async function getDB() {
  // Clear module cache and re-import
  vi.resetModules()
  return await import('./db')
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSourceTableNode(id: string, name: string) {
  return {
    id,
    kind: 'source_table' as const,
    name,
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: `file_${id}`,
      fileName: `${name}.csv`,
      fileType: 'csv' as const,
      inferredSchemaVersion: 1,
    },
    schema: {
      columns: [
        { id: 'col_1', name: 'ID', type: 'string', nullable: false },
        { id: 'col_2', name: 'Value', type: 'number', nullable: true },
      ],
      rowCount: 10,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createMockDerivedTableNode(id: string, name: string, upstreamIds: string[]) {
  return {
    id,
    kind: 'derived_table' as const,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createMockEdge(from: string, to: string) {
  return {
    id: `edge_${from}_${to}`,
    fromNodeId: from,
    toNodeId: to,
    transformType: 'filter',
  }
}

function createMockPatches() {
  return {
    cellPatches: {
      row_1: { col_1: 'edited value' },
    },
    deletedRows: new Set(['row_5']),
    insertedRows: [
      { rowId: 'row_new', values: { col_1: 'new', col_2: 100 }, insertedAt: 0 },
    ],
    highlightedCells: new Set(['row_1:col_1']),
  }
}

function createMockReport(id: string, name: string) {
  return {
    id,
    name,
    tiptapContent: {
      type: 'doc' as const,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello World' }] },
      ],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ============================================================================
// Project Operations
// ============================================================================

describe('Project Operations', () => {
  it('saves and loads a project', async () => {
    const db = await getDB()
    
    const projectId = 'test-project-1'
    const projectName = 'Test Project'
    const nodes = {
      table_a: createMockSourceTableNode('table_a', 'Sales'),
      table_b: createMockDerivedTableNode('table_b', 'Filtered Sales', ['table_a']),
    }
    const edges = {
      edge_1: createMockEdge('table_a', 'table_b'),
    }
    const patches = {
      table_a: createMockPatches(),
    }

    // Save
    await db.saveProject(projectId, projectName, nodes, edges, patches)

    // Load
    const loaded = await db.loadProject(projectId)

    expect(loaded).not.toBeNull()
    expect(loaded?.id).toBe(projectId)
    expect(loaded?.name).toBe(projectName)
    expect(Object.keys(loaded?.nodes || {})).toHaveLength(2)
    expect(Object.keys(loaded?.edges || {})).toHaveLength(1)
    expect(loaded?.nodes.table_a.name).toBe('Sales')
  })

  it('returns null for non-existent project', async () => {
    const db = await getDB()
    
    const loaded = await db.loadProject('non-existent-id')
    expect(loaded).toBeNull()
  })

  it('serializes patches with Sets correctly', async () => {
    const db = await getDB()
    
    const projectId = 'patch-test'
    const patches = {
      table_1: {
        cellPatches: { row_1: { col_1: 'value' } },
        deletedRows: new Set(['row_a', 'row_b', 'row_c']),
        insertedRows: [],
        highlightedCells: new Set(['row_1:col_1', 'row_2:col_2']),
      },
    }

    await db.saveProject(projectId, 'Patch Test', {}, {}, patches)
    const loaded = await db.loadProject(projectId)

    expect(loaded).not.toBeNull()
    // Patches are serialized as arrays
    expect(loaded?.patches.table_1.deletedRows).toBeInstanceOf(Array)
    expect(loaded?.patches.table_1.deletedRows).toHaveLength(3)
    expect(loaded?.patches.table_1.highlightedCells).toHaveLength(2)
  })

  it('lists projects sorted by updated date', async () => {
    const db = await getDB()
    
    // Create projects with slight delays to ensure different timestamps
    await db.saveProject('proj_1', 'First Project', {}, {}, {})
    await new Promise(resolve => setTimeout(resolve, 10))
    await db.saveProject('proj_2', 'Second Project', {}, {}, {})
    await new Promise(resolve => setTimeout(resolve, 10))
    await db.saveProject('proj_3', 'Third Project', {}, {}, {})

    const projects = await db.listProjects()

    expect(projects).toHaveLength(3)
    // Should be sorted by most recent first
    expect(projects[0].name).toBe('Third Project')
    expect(projects[2].name).toBe('First Project')
  })

  it('deletes a project', async () => {
    const db = await getDB()
    
    await db.saveProject('to-delete', 'Delete Me', {}, {}, {})
    
    // Verify it exists
    let loaded = await db.loadProject('to-delete')
    expect(loaded).not.toBeNull()

    // Delete
    await db.deleteProject('to-delete')

    // Verify it's gone
    loaded = await db.loadProject('to-delete')
    expect(loaded).toBeNull()
  })

  it('updates existing project', async () => {
    const db = await getDB()
    
    const projectId = 'update-test'
    
    // Create initial project
    await db.saveProject(projectId, 'Initial Name', {}, {}, {})
    
    // Update it
    const newNodes = { table_1: createMockSourceTableNode('table_1', 'New Table') }
    await db.saveProject(projectId, 'Updated Name', newNodes, {}, {})

    // Load and verify
    const loaded = await db.loadProject(projectId)
    expect(loaded?.name).toBe('Updated Name')
    expect(Object.keys(loaded?.nodes || {})).toHaveLength(1)
  })
})

// ============================================================================
// File Operations
// ============================================================================

describe('File Operations', () => {
  it('saves and loads a file', async () => {
    const db = await getDB()
    
    const fileId = 'file_123'
    const fileName = 'data.csv'
    const fileType = 'text/csv'
    const content = 'id,name,value\n1,Alice,100\n2,Bob,200'
    const encoder = new TextEncoder()
    const fileData = encoder.encode(content).buffer

    // Save
    await db.saveFile(fileId, fileName, fileType, fileData)

    // Load
    const loaded = await db.loadFile(fileId)

    expect(loaded).not.toBeNull()
    expect(loaded?.byteLength).toBe(fileData.byteLength)
    
    // Verify content
    const decoder = new TextDecoder()
    const loadedContent = decoder.decode(loaded!)
    expect(loadedContent).toBe(content)
  })

  it('returns null for non-existent file', async () => {
    const db = await getDB()
    
    const loaded = await db.loadFile('non-existent-file')
    expect(loaded).toBeNull()
  })

  it('deletes a file', async () => {
    const db = await getDB()
    
    const fileId = 'file-to-delete'
    const encoder = new TextEncoder()
    const fileData = encoder.encode('test').buffer

    await db.saveFile(fileId, 'test.txt', 'text/plain', fileData)
    
    // Verify exists
    let loaded = await db.loadFile(fileId)
    expect(loaded).not.toBeNull()

    // Delete
    await db.deleteFile(fileId)

    // Verify gone
    loaded = await db.loadFile(fileId)
    expect(loaded).toBeNull()
  })

  it('handles binary file data (Excel)', async () => {
    const db = await getDB()
    
    // Create mock binary data (simulating Excel file)
    const binaryData = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00])
    const fileData = binaryData.buffer

    await db.saveFile('excel_file', 'data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileData)
    
    const loaded = await db.loadFile('excel_file')
    
    expect(loaded).not.toBeNull()
    expect(loaded?.byteLength).toBe(6)
    
    const loadedBytes = new Uint8Array(loaded!)
    expect(loadedBytes[0]).toBe(0x50)
    expect(loadedBytes[1]).toBe(0x4B)
  })
})

// ============================================================================
// Cache Operations
// ============================================================================

describe('Cache Operations', () => {
  it('saves and loads cache data', async () => {
    const db = await getDB()
    
    const tableId = 'table_123'
    const profileData = {
      columns: [
        { columnId: 'col_1', distinctCount: 50, missingCount: 2 },
      ],
      rowCount: 100,
    }

    // Save
    await db.saveCache(tableId, 'profile', profileData)

    // Load
    const loaded = await db.loadCache(tableId, 'profile')

    expect(loaded).toEqual(profileData)
  })

  it('returns null for non-existent cache', async () => {
    const db = await getDB()
    
    const loaded = await db.loadCache('unknown-table', 'profile')
    expect(loaded).toBeNull()
  })

  it('handles different cache types', async () => {
    const db = await getDB()
    
    const tableId = 'table_multi_cache'
    
    await db.saveCache(tableId, 'profile', { type: 'profile' })
    await db.saveCache(tableId, 'slice', { type: 'slice' })
    await db.saveCache(tableId, 'aggregation', { type: 'agg' })

    const profile = await db.loadCache(tableId, 'profile')
    const slice = await db.loadCache(tableId, 'slice')
    const agg = await db.loadCache(tableId, 'aggregation')

    expect((profile as { type: string }).type).toBe('profile')
    expect((slice as { type: string }).type).toBe('slice')
    expect((agg as { type: string }).type).toBe('agg')
  })

  it('clears cache for a specific table', async () => {
    const db = await getDB()
    
    // Create cache for multiple tables
    await db.saveCache('table_1', 'profile', { data: 1 })
    await db.saveCache('table_1', 'slice', { data: 2 })
    await db.saveCache('table_2', 'profile', { data: 3 })

    // Clear table_1 cache
    await db.clearTableCache('table_1')

    // Verify table_1 cache is gone
    expect(await db.loadCache('table_1', 'profile')).toBeNull()
    expect(await db.loadCache('table_1', 'slice')).toBeNull()
    
    // Verify table_2 cache remains
    expect(await db.loadCache('table_2', 'profile')).toEqual({ data: 3 })
  })
})

// ============================================================================
// Report Operations
// ============================================================================

describe('Report Operations', () => {
  it('saves and loads a report', async () => {
    const db = await getDB()
    
    const report = createMockReport('report_1', 'Monthly Report')

    await db.saveReport(report)
    const loaded = await db.loadReport('report_1')

    expect(loaded).not.toBeNull()
    expect(loaded?.name).toBe('Monthly Report')
    expect(loaded?.tiptapContent?.content).toHaveLength(1)
  })

  it('returns null for non-existent report', async () => {
    const db = await getDB()
    
    const loaded = await db.loadReport('non-existent')
    expect(loaded).toBeNull()
  })

  it('lists reports', async () => {
    const db = await getDB()
    
    await db.saveReport(createMockReport('r1', 'Report 1'))
    await new Promise(resolve => setTimeout(resolve, 10))
    await db.saveReport(createMockReport('r2', 'Report 2'))

    const reports = await db.listReports()

    expect(reports).toHaveLength(2)
  })

  it('deletes a report', async () => {
    const db = await getDB()
    
    await db.saveReport(createMockReport('to-delete', 'Delete Me'))
    
    let loaded = await db.loadReport('to-delete')
    expect(loaded).not.toBeNull()

    await db.deleteReport('to-delete')

    loaded = await db.loadReport('to-delete')
    expect(loaded).toBeNull()
  })

  it('loads all reports', async () => {
    const db = await getDB()
    
    await db.saveReport(createMockReport('r1', 'Report 1'))
    await db.saveReport(createMockReport('r2', 'Report 2'))
    await db.saveReport(createMockReport('r3', 'Report 3'))

    const allReports = await db.loadAllReports()

    expect(Object.keys(allReports)).toHaveLength(3)
    expect(allReports['r1'].name).toBe('Report 1')
    expect(allReports['r2'].name).toBe('Report 2')
    expect(allReports['r3'].name).toBe('Report 3')
  })

  it('bulk saves reports', async () => {
    const db = await getDB()
    
    const reports = {
      r1: createMockReport('r1', 'Bulk 1'),
      r2: createMockReport('r2', 'Bulk 2'),
    }

    await db.saveAllReports(reports)

    const loaded = await db.loadAllReports()
    expect(Object.keys(loaded)).toHaveLength(2)
  })
})

// ============================================================================
// Export/Import Operations
// ============================================================================

describe('Export/Import Operations', () => {
  it('exports project with embedded files', async () => {
    const db = await getDB()
    
    // Create project with file reference
    const projectId = 'export-test'
    const nodes = {
      table_1: createMockSourceTableNode('table_1', 'Data Table'),
    }
    
    // Save the referenced file
    const fileContent = 'id,name\n1,Alice\n2,Bob'
    const encoder = new TextEncoder()
    await db.saveFile('file_table_1', 'data.csv', 'text/csv', encoder.encode(fileContent).buffer)
    
    // Save project
    await db.saveProject(projectId, 'Export Test', nodes, {}, {})

    // Export
    const exportBlob = await db.exportProjectFile(projectId)

    expect(exportBlob).toBeInstanceOf(Blob)
    expect(exportBlob.type).toBe('application/json')
    expect(exportBlob.size).toBeGreaterThan(0)

    // Parse export to verify structure
    const exportText = await exportBlob.text()
    const exportData = JSON.parse(exportText)

    expect(exportData.version).toBeDefined()
    expect(exportData.formatType).toBe('tablecanvas-full')
    expect(exportData.project.name).toBe('Export Test')
    expect(exportData.files['file_table_1']).toBeDefined()
    expect(exportData.files['file_table_1'].data).toBeDefined() // base64 encoded
  })

  it('throws error when exporting non-existent project', async () => {
    const db = await getDB()
    
    await expect(db.exportProjectFile('non-existent')).rejects.toThrow('Project not found')
  })

  it('parses import file and restores files with new IDs', async () => {
    const db = await getDB()
    
    // Create export data
    const exportData = {
      version: '2.0.0',
      formatType: 'tablecanvas-full',
      exportedAt: new Date().toISOString(),
      project: {
        id: 'original-id',
        name: 'Imported Project',
        nodes: {
          table_1: {
            ...createMockSourceTableNode('table_1', 'Imported Table'),
            plan: {
              fileRef: 'old_file_id',
              fileName: 'data.csv',
              fileType: 'csv' as const,
              inferredSchemaVersion: 1,
            },
          },
        },
        edges: {},
        patches: {},
      },
      files: {
        old_file_id: {
          id: 'old_file_id',
          name: 'data.csv',
          type: 'text/csv',
          data: btoa('id,name\n1,Test'), // base64 encoded
          createdAt: new Date().toISOString(),
        },
      },
    }

    // Create mock file
    const mockFile = new File(
      [JSON.stringify(exportData)],
      'project.tablecanvas.json',
      { type: 'application/json' }
    )

    // Parse import
    const parsed = await db.parseImportFile(mockFile)

    expect(parsed.name).toBe('Imported Project')
    expect(parsed.filesRestored).toBe(1)
    
    // Verify file ref was remapped to new ID
    const tableNode = parsed.nodes.table_1 as { plan: { fileRef: string } }
    expect(tableNode.plan.fileRef).not.toBe('old_file_id')
    expect(tableNode.plan.fileRef).toMatch(/^file_/)
  })

  it('handles import with missing files gracefully', async () => {
    const db = await getDB()
    
    const exportData = {
      version: '2.0.0',
      formatType: 'tablecanvas-full',
      exportedAt: new Date().toISOString(),
      project: {
        id: 'proj',
        name: 'Test',
        nodes: {
          table_1: {
            ...createMockSourceTableNode('table_1', 'Table'),
            plan: {
              fileRef: 'missing_file', // File not in export
              fileName: 'missing.csv',
              fileType: 'csv' as const,
              inferredSchemaVersion: 1,
            },
          },
        },
        edges: {},
        patches: {},
      },
      files: {}, // No files included
    }

    const mockFile = new File(
      [JSON.stringify(exportData)],
      'project.json',
      { type: 'application/json' }
    )

    const parsed = await db.parseImportFile(mockFile)

    // Should succeed but report 0 files restored
    expect(parsed.filesRestored).toBe(0)
    // Original fileRef should be preserved (no mapping available)
    const tableNode = parsed.nodes.table_1 as { plan: { fileRef: string } }
    expect(tableNode.plan.fileRef).toBe('missing_file')
  })

  it('rejects invalid export format', async () => {
    const db = await getDB()
    
    const mockFile = new File(
      ['not valid json'],
      'invalid.json',
      { type: 'application/json' }
    )

    await expect(db.parseImportFile(mockFile)).rejects.toThrow('Invalid file')
  })

  it('rejects export with unsupported version', async () => {
    const db = await getDB()
    
    const exportData = {
      version: '99.0.0', // Future version
      project: { id: 'test', name: 'Test', nodes: {}, edges: {}, patches: {} },
    }

    const mockFile = new File(
      [JSON.stringify(exportData)],
      'future.json',
      { type: 'application/json' }
    )

    await expect(db.parseImportFile(mockFile)).rejects.toThrow('Unsupported export version')
  })

  it('imports reports when option is enabled', async () => {
    const db = await getDB()
    
    const exportData = {
      version: '2.0.0',
      formatType: 'tablecanvas-full',
      exportedAt: new Date().toISOString(),
      project: {
        id: 'proj',
        name: 'Test',
        nodes: {},
        edges: {},
        patches: {},
      },
      files: {},
      reports: {
        r1: createMockReport('r1', 'Imported Report'),
      },
    }

    const mockFile = new File(
      [JSON.stringify(exportData)],
      'with-reports.json',
      { type: 'application/json' }
    )

    const parsed = await db.parseImportFile(mockFile, { importReports: true })

    expect(parsed.reportsRestored).toBe(1)
  })

  it('skips reports when option is disabled', async () => {
    const db = await getDB()
    
    const exportData = {
      version: '2.0.0',
      formatType: 'tablecanvas-full',
      exportedAt: new Date().toISOString(),
      project: {
        id: 'proj',
        name: 'Test',
        nodes: {},
        edges: {},
        patches: {},
      },
      files: {},
      reports: {
        r1: createMockReport('r1', 'Skipped Report'),
      },
    }

    const mockFile = new File(
      [JSON.stringify(exportData)],
      'skip-reports.json',
      { type: 'application/json' }
    )

    const parsed = await db.parseImportFile(mockFile, { importReports: false })

    expect(parsed.reportsRestored).toBe(0)
  })

  it('converts patches Sets back to proper format on import', async () => {
    const db = await getDB()
    
    const exportData = {
      version: '2.0.0',
      formatType: 'tablecanvas-full',
      exportedAt: new Date().toISOString(),
      project: {
        id: 'proj',
        name: 'Test',
        nodes: {},
        edges: {},
        patches: {
          table_1: {
            cellPatches: { row_1: { col_1: 'value' } },
            deletedRows: ['row_a', 'row_b'],
            insertedRows: [],
            highlightedCells: ['row_1:col_1'],
          },
        },
      },
      files: {},
    }

    const mockFile = new File(
      [JSON.stringify(exportData)],
      'patches.json',
      { type: 'application/json' }
    )

    const parsed = await db.parseImportFile(mockFile)

    // Patches should have Sets, not arrays
    expect(parsed.patches.table_1.deletedRows).toBeInstanceOf(Set)
    expect(parsed.patches.table_1.deletedRows.has('row_a')).toBe(true)
    expect(parsed.patches.table_1.highlightedCells).toBeInstanceOf(Set)
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('handles empty project', async () => {
    const db = await getDB()
    
    await db.saveProject('empty', 'Empty Project', {}, {}, {})
    const loaded = await db.loadProject('empty')

    expect(loaded).not.toBeNull()
    expect(Object.keys(loaded?.nodes || {})).toHaveLength(0)
    expect(Object.keys(loaded?.edges || {})).toHaveLength(0)
  })

  it('handles large file data', async () => {
    const db = await getDB()
    
    // Create 1MB of data
    const largeData = new Uint8Array(1024 * 1024)
    for (let i = 0; i < largeData.length; i++) {
      largeData[i] = i % 256
    }

    await db.saveFile('large-file', 'large.bin', 'application/octet-stream', largeData.buffer)
    const loaded = await db.loadFile('large-file')

    expect(loaded?.byteLength).toBe(1024 * 1024)
  })

  it('handles special characters in project name', async () => {
    const db = await getDB()
    
    const specialName = 'Test "Project" <with> & special \'chars\''
    await db.saveProject('special', specialName, {}, {}, {})
    const loaded = await db.loadProject('special')

    expect(loaded?.name).toBe(specialName)
  })

  it('handles concurrent saves to same project', async () => {
    const db = await getDB()
    
    const projectId = 'concurrent'
    
    // Fire off multiple saves concurrently
    await Promise.all([
      db.saveProject(projectId, 'Version 1', {}, {}, {}),
      db.saveProject(projectId, 'Version 2', {}, {}, {}),
      db.saveProject(projectId, 'Version 3', {}, {}, {}),
    ])

    // Should have one project (last write wins)
    const loaded = await db.loadProject(projectId)
    expect(loaded).not.toBeNull()
  })

  it('handles complex nested data structures', async () => {
    const db = await getDB()
    
    const complexData = {
      deeply: {
        nested: {
          object: {
            with: {
              array: [1, 2, { inner: 'value' }],
            },
          },
        },
      },
    }

    await db.saveCache('complex', 'profile', complexData)
    const loaded = await db.loadCache('complex', 'profile') as typeof complexData

    expect(loaded.deeply.nested.object.with.array[2]).toEqual({ inner: 'value' })
  })
})
