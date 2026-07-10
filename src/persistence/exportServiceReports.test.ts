import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import {
  createMockReport,
  createMockSourceTableNode,
  JSZip,
  type StoredProject,
} from './exportServiceTestSupport'

vi.mock('./db', () => ({
  exportProjectFile: vi.fn(),
  loadProject: vi.fn(),
  loadReportsForProject: vi.fn(),
  loadFile: vi.fn(),
}))
vi.mock('@/engine/materializationService', () => ({
  getTableData: vi.fn(),
  ensureTableMaterialized: vi.fn(),
}))

import * as db from './db'
import * as materializationService from '@/engine/materializationService'
import { exportProjectAsZip } from './exportService'

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportProjectAsZip errors', () => {
  it('throws when project does not exist', async () => {
    vi.mocked(db.exportProjectFile).mockRejectedValue(new Error('Project not found'))
    await expect(exportProjectAsZip('nonexistent')).rejects.toThrow('Project not found')
  })

  it('throws when loadProject returns null with includeExcel', async () => {
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob(['{}'], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(null)
    await expect(exportProjectAsZip('invalid', { includeExcel: true }))
      .rejects.toThrow('Project not found')
  })
})

describe('Report HTML Generation', () => {
  it('exports embedded table data and chart source metadata from the requested project', async () => {
    const table = {
      ...createMockSourceTableNode('sales', 'Sales Export'),
      schema: {
        columns: [
          { id: 'customer', name: 'Customer', type: 'string' as const, nullable: false },
          { id: 'total', name: 'Order Total', type: 'number' as const, nullable: false },
        ],
        rowCount: 2,
      },
    }
    const project = {
      id: 'export-project',
      name: 'Export Project',
      nodes: { sales: table },
      edges: {},
      patches: {},
    }
    const report = {
      id: 'embedded-report',
      name: 'Embedded Report',
      tiptapContent: {
        type: 'doc' as const,
        content: [
          {
            type: 'embeddedTable',
            attrs: {
              sourceTableId: 'sales',
              selectedColumns: ['customer', 'total'],
              rowSelectionMode: 'first_n',
              rowLimit: 2,
            },
          },
          {
            type: 'chartBlock',
            attrs: {
              sourceTableId: 'sales',
              chartType: 'bar',
              rowLimit: 5,
              config: {
                xAxis: 'customer',
                yAxis: 'total',
                aggregation: 'sum',
                title: 'Sales by customer',
              },
            },
          },
        ],
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({ report })
    vi.mocked(materializationService.getTableData).mockResolvedValue({
      rows: [
        { __rowId: 'row-1', customer: 'Alice', total: 42 },
        { __rowId: 'row-2', customer: 'Bob', total: 75 },
      ],
      totalRows: 2,
    })

    const zip = await JSZip.loadAsync(await exportProjectAsZip('export-project', {
      includeExcel: false,
      includeReportHtml: true,
    }))
    const html = await zip.files['reports/Embedded Report.html'].async('string')

    expect(materializationService.getTableData).toHaveBeenCalledTimes(1)
    expect(materializationService.getTableData).toHaveBeenCalledWith('sales', 0, 5)
    expect(html).toContain('Customer')
    expect(html).toContain('Order Total')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('class="report-chart"')
    expect(html).toContain('Sales by customer')
    expect(html).toContain('<rect')
    expect(html).toContain('Source: Sales Export')
  })

  it('keeps report export usable when an embedded table read fails', async () => {
    const table = createMockSourceTableNode('sales', 'Sales Export')
    const project = {
      id: 'export-project',
      name: 'Export Project',
      nodes: { sales: table },
      edges: {},
      patches: {},
    }
    const report = {
      id: 'failed-report',
      name: 'Failed Data Report',
      tiptapContent: {
        type: 'doc' as const,
        content: [{
          type: 'embeddedTable',
          attrs: { sourceTableId: 'sales', rowLimit: 10 },
        }],
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({ report })
    vi.mocked(materializationService.getTableData).mockRejectedValue(
      new Error('materialization failed'),
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const zip = await JSZip.loadAsync(await exportProjectAsZip('export-project', {
      includeExcel: false,
      includeReportHtml: true,
    }))
    const html = await zip.files['reports/Failed Data Report.html'].async('string')
    expect(html).toContain('Embedded Table: Sales Export')
    expect(html).toContain('no data')
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  it('generates HTML for reports', async () => {
    const project = { id: 'test', name: 'Test', nodes: {}, edges: {}, patches: {} }
    const report = createMockReport('r1', 'Test Report')
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({ r1: report })
    const zip = await JSZip.loadAsync(await exportProjectAsZip('test', {
      includeExcel: false,
      includeReportHtml: true,
    }))
    const htmlFile = zip.files['reports/Test Report.html']
    expect(htmlFile).toBeDefined()
    const html = await htmlFile.async('string')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Test Report')
    expect(html).toContain('<h1>Report Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('generates HTML for reports with TipTap content', async () => {
    const project = { id: 'test', name: 'Test', nodes: {}, edges: {}, patches: {} }
    const report = createMockReport('r1', 'TipTap Report')
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({ r1: report })
    const zip = await JSZip.loadAsync(await exportProjectAsZip('test', {
      includeExcel: false,
      includeReportHtml: true,
    }))
    const htmlFile = zip.files['reports/TipTap Report.html']
    expect(htmlFile).toBeDefined()
    const html = await htmlFile.async('string')
    expect(html).toContain('<h1>Report Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('generates empty report placeholder for reports with no content', async () => {
    const project = { id: 'test', name: 'Test', nodes: {}, edges: {}, patches: {} }
    const report = {
      id: 'empty',
      name: 'Empty Report',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({ empty: report })
    const zip = await JSZip.loadAsync(await exportProjectAsZip('test', {
      includeExcel: false,
      includeReportHtml: true,
    }))
    const html = await zip.files['reports/Empty Report.html'].async('string')
    expect(html).toContain('This report is empty')
  })

  it('sanitizes report filenames with special characters', async () => {
    const project = { id: 'test', name: 'Test', nodes: {}, edges: {}, patches: {} }
    const report = {
      id: 'special',
      name: 'Report: Q1/Q2 <2024>',
      tiptapContent: {
        type: 'doc' as const,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test' }] }],
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({ special: report })
    const zip = await JSZip.loadAsync(await exportProjectAsZip('test', {
      includeExcel: false,
      includeReportHtml: true,
    }))
    const files = Object.keys(zip.files)
      .filter(file => file.startsWith('reports/') && file.endsWith('.html'))
    expect(files.length).toBe(1)
    const filename = files[0].replace('reports/', '')
    expect(filename).not.toContain(':')
    expect(filename).not.toContain('<')
    expect(filename).not.toContain('>')
  })
})
