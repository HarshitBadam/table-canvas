import { describe, expect, it } from 'vitest'
import {
  createMockDerivedTableNode,
  createMockEdge,
  createMockPatches,
  createMockSourceTableNode,
  getDB,
} from './dbTestSupport'

describe('Project Operations', () => {
  it('saves and loads a project', async () => {
    const db = await getDB()
    const nodes = {
      table_a: createMockSourceTableNode('table_a', 'Sales'),
      table_b: createMockDerivedTableNode('table_b', 'Filtered Sales', ['table_a']),
    }
    const edges = { edge_1: createMockEdge('table_a', 'table_b') }
    const patches = { table_a: createMockPatches() }

    await db.saveProject('test-project-1', 'Test Project', nodes, edges, patches)
    const loaded = await db.loadProject('test-project-1')

    expect(loaded).not.toBeNull()
    expect(loaded?.id).toBe('test-project-1')
    expect(loaded?.name).toBe('Test Project')
    expect(Object.keys(loaded?.nodes || {})).toHaveLength(2)
    expect(Object.keys(loaded?.edges || {})).toHaveLength(1)
    expect(loaded?.nodes.table_a.name).toBe('Sales')
  })

  it('returns null for non-existent project', async () => {
    const db = await getDB()
    expect(await db.loadProject('non-existent-id')).toBeNull()
  })

  it('serializes patches with Sets correctly', async () => {
    const db = await getDB()
    const patches = {
      table_1: {
        cellPatches: { row_1: { col_1: 'value' } },
        deletedRows: new Set(['row_a', 'row_b', 'row_c']),
        insertedRows: [],
        highlightedCells: new Set(['row_1:col_1', 'row_2:col_2']),
      },
    }

    await db.saveProject('patch-test', 'Patch Test', {}, {}, patches)
    const loaded = await db.loadProject('patch-test')

    expect(loaded).not.toBeNull()
    expect(loaded?.patches.table_1.deletedRows).toBeInstanceOf(Array)
    expect(loaded?.patches.table_1.deletedRows).toHaveLength(3)
    expect(loaded?.patches.table_1.highlightedCells).toHaveLength(2)
  })

  it('lists projects sorted by updated date', async () => {
    const db = await getDB()
    await db.saveProject('proj_1', 'First Project', {}, {}, {})
    await new Promise(resolve => setTimeout(resolve, 10))
    await db.saveProject('proj_2', 'Second Project', {}, {}, {})
    await new Promise(resolve => setTimeout(resolve, 10))
    await db.saveProject('proj_3', 'Third Project', {}, {}, {})

    const projects = await db.listProjects()
    expect(projects).toHaveLength(3)
    expect(projects[0].name).toBe('Third Project')
    expect(projects[2].name).toBe('First Project')
  })

  it('deletes a project', async () => {
    const db = await getDB()
    await db.saveProject('to-delete', 'Delete Me', {}, {}, {})
    expect(await db.loadProject('to-delete')).not.toBeNull()
    await db.deleteProject('to-delete')
    expect(await db.loadProject('to-delete')).toBeNull()
  })

  it('updates existing project', async () => {
    const db = await getDB()
    await db.saveProject('update-test', 'Initial Name', {}, {}, {})
    const nodes = { table_1: createMockSourceTableNode('table_1', 'New Table') }
    await db.saveProject('update-test', 'Updated Name', nodes, {}, {})

    const loaded = await db.loadProject('update-test')
    expect(loaded?.name).toBe('Updated Name')
    expect(Object.keys(loaded?.nodes || {})).toHaveLength(1)
  })
})

describe('File Operations', () => {
  it('saves and loads a file', async () => {
    const db = await getDB()
    const content = 'id,name,value\n1,Alice,100\n2,Bob,200'
    const fileData = new TextEncoder().encode(content).buffer
    await db.saveFile('file_123', 'data.csv', 'text/csv', fileData)
    const loaded = await db.loadFile('file_123')

    expect(loaded).not.toBeNull()
    expect(loaded?.byteLength).toBe(fileData.byteLength)
    expect(new TextDecoder().decode(loaded!)).toBe(content)
  })

  it('returns null for non-existent file', async () => {
    const db = await getDB()
    expect(await db.loadFile('non-existent-file')).toBeNull()
  })

  it('deletes a file', async () => {
    const db = await getDB()
    const fileData = new TextEncoder().encode('test').buffer
    await db.saveFile('file-to-delete', 'test.txt', 'text/plain', fileData)
    expect(await db.loadFile('file-to-delete')).not.toBeNull()
    await db.deleteFile('file-to-delete')
    expect(await db.loadFile('file-to-delete')).toBeNull()
  })

  it('handles binary file data (Excel)', async () => {
    const db = await getDB()
    const fileData = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00]).buffer
    await db.saveFile(
      'excel_file',
      'data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileData,
    )
    const loaded = await db.loadFile('excel_file')

    expect(loaded).not.toBeNull()
    expect(loaded?.byteLength).toBe(6)
    const loadedBytes = new Uint8Array(loaded!)
    expect(loadedBytes[0]).toBe(0x50)
    expect(loadedBytes[1]).toBe(0x4B)
  })
})
