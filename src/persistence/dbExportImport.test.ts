import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  createMockReport,
  createMockSourceTableNode,
  getDB,
} from './dbTestSupport'

describe('Export/Import Operations', () => {
  it('exports project with embedded files', async () => {
    const db = await getDB()
    const nodes = { table_1: createMockSourceTableNode('table_1', 'Data Table') }
    const fileData = new TextEncoder().encode('id,name\n1,Alice\n2,Bob').buffer
    await db.saveFile('file_table_1', 'data.csv', 'text/csv', fileData)
    await db.saveProject('export-test', 'Export Test', nodes, {}, {})

    const exportBlob = await db.exportProjectFile('export-test')
    expect(exportBlob).toBeInstanceOf(Blob)
    expect(exportBlob.type).toBe('application/json')
    expect(exportBlob.size).toBeGreaterThan(0)

    const exportData = JSON.parse(await exportBlob.text())
    expect(exportData.version).toBeDefined()
    expect(exportData.formatType).toBe('tablecanvas-full')
    expect(exportData.project.name).toBe('Export Test')
    expect(exportData.files.file_table_1).toBeDefined()
    expect(exportData.files.file_table_1.data).toBeDefined()
  })

  it('throws error when exporting non-existent project', async () => {
    const db = await getDB()
    await expect(db.exportProjectFile('non-existent')).rejects.toThrow('Project not found')
  })

  it('parses import file and restores files with new IDs', async () => {
    const db = await getDB()
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
          data: btoa('id,name\n1,Test'),
          createdAt: new Date().toISOString(),
        },
      },
    }
    const file = new File([JSON.stringify(exportData)], 'project.tablecanvas.json', {
      type: 'application/json',
    })
    const parsed = await db.parseImportFile(file)

    expect(parsed.name).toBe('Imported Project')
    expect(parsed.filesRestored).toBe(1)
    const tableNode = parsed.nodes.table_1 as { plan: { fileRef: string } }
    expect(tableNode.plan.fileRef).not.toBe('old_file_id')
    expect(tableNode.plan.fileRef).toMatch(/^(?:local_)?file_/)
  })

  it('rejects an incomplete archive instead of creating broken tables', async () => {
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
              fileRef: 'missing_file',
              fileName: 'missing.csv',
              fileType: 'csv' as const,
              inferredSchemaVersion: 1,
            },
          },
        },
        edges: {},
        patches: {},
      },
      files: {},
    }
    const file = new File([JSON.stringify(exportData)], 'project.json', {
      type: 'application/json',
    })
    await expect(db.parseImportFile(file)).rejects.toThrow(
      'Project archive is incomplete',
    )
  })

  it('imports the ZIP format produced by project export', async () => {
    const db = await getDB()
    const exportData = {
      version: '2.0.0',
      formatType: 'tablecanvas-full',
      exportedAt: new Date().toISOString(),
      project: {
        id: 'zip-project',
        name: 'ZIP Project',
        nodes: {},
        edges: {},
        patches: {},
      },
      files: {},
    }
    const zip = new JSZip()
    zip.file('project.tablecanvas.json', JSON.stringify(exportData))
    const archive = await zip.generateAsync({ type: 'uint8array' })
    const file = new File([archive], 'project.tablecanvas.zip', {
      type: 'application/zip',
    })

    const parsed = await db.parseImportFile(file)

    expect(parsed.name).toBe('ZIP Project')
  })

  it('rejects invalid export format', async () => {
    const db = await getDB()
    const file = new File(['not valid json'], 'invalid.json', { type: 'application/json' })
    await expect(db.parseImportFile(file)).rejects.toThrow('Invalid file')
  })

  it('rejects export with unsupported version', async () => {
    const db = await getDB()
    const exportData = {
      version: '99.0.0',
      project: { id: 'test', name: 'Test', nodes: {}, edges: {}, patches: {} },
    }
    const file = new File([JSON.stringify(exportData)], 'future.json', {
      type: 'application/json',
    })
    await expect(db.parseImportFile(file)).rejects.toThrow('Unsupported export version')
  })

  it('imports reports when option is enabled', async () => {
    const db = await getDB()
    const exportData = {
      version: '2.0.0',
      formatType: 'tablecanvas-full',
      exportedAt: new Date().toISOString(),
      project: { id: 'proj', name: 'Test', nodes: {}, edges: {}, patches: {} },
      files: {},
      reports: { r1: createMockReport('r1', 'Imported Report') },
    }
    const file = new File([JSON.stringify(exportData)], 'with-reports.json', {
      type: 'application/json',
    })
    const parsed = await db.parseImportFile(file, { importReports: true })
    expect(parsed.reportsRestored).toBe(1)
  })

  it('skips reports when option is disabled', async () => {
    const db = await getDB()
    const exportData = {
      version: '2.0.0',
      formatType: 'tablecanvas-full',
      exportedAt: new Date().toISOString(),
      project: { id: 'proj', name: 'Test', nodes: {}, edges: {}, patches: {} },
      files: {},
      reports: { r1: createMockReport('r1', 'Skipped Report') },
    }
    const file = new File([JSON.stringify(exportData)], 'skip-reports.json', {
      type: 'application/json',
    })
    const parsed = await db.parseImportFile(file, { importReports: false })
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
    const file = new File([JSON.stringify(exportData)], 'patches.json', {
      type: 'application/json',
    })
    const parsed = await db.parseImportFile(file)
    expect(parsed.patches.table_1.deletedRows).toBeInstanceOf(Set)
    expect(parsed.patches.table_1.deletedRows.has('row_a')).toBe(true)
    expect(parsed.patches.table_1.highlightedCells).toBeInstanceOf(Set)
  })
})
