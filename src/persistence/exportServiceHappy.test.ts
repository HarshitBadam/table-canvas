import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import * as XLSX from 'xlsx'
import {
  createCSVContent,
  createMockDerivedTableNode,
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

describe('exportProjectAsZip happy paths', () => {
  it('creates a ZIP blob with project.tablecanvas.json', async () => {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      nodes: {},
      edges: {},
      patches: {},
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})

    const blob = await exportProjectAsZip('test-project', {
      includeExcel: false,
      includeReportHtml: false,
    })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
    expect((await JSZip.loadAsync(blob)).files['project.tablecanvas.json']).toBeDefined()
  })

  it('includes data.xlsx when includeExcel is true with source tables', async () => {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      nodes: {
        table_1: createMockSourceTableNode('table_1', 'Sales Data', 'file_1'),
      },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    vi.mocked(materializationService.getTableData).mockResolvedValue({
      rows: [
        { __rowId: 'row-1', col_1: '1', col_2: 100 },
        { __rowId: 'row-2', col_1: '2', col_2: 200 },
        { __rowId: 'row-3', col_1: '3', col_2: 300 },
      ],
      totalRows: 3,
    })

    const zip = await JSZip.loadAsync(await exportProjectAsZip('test-project', {
      includeExcel: true,
      includeReportHtml: false,
    }))
    expect(zip.files['project.tablecanvas.json']).toBeDefined()
    expect(zip.files['data.xlsx']).toBeDefined()
    const workbook = XLSX.read(await zip.files['data.xlsx'].async('arraybuffer'), {
      type: 'array',
    })
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Sales Data'], {
      header: 1,
    })
    expect(rows).toEqual([
      ['ID', 'Value'],
      ['1', 100],
      ['2', 200],
      ['3', 300],
    ])
  })

  it('includes reports folder when includeReportHtml is true', async () => {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      nodes: {},
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({
      report_1: createMockReport('report_1', 'Monthly Report'),
      report_2: createMockReport('report_2', 'Quarterly Summary'),
    })

    const zip = await JSZip.loadAsync(await exportProjectAsZip('test-project', {
      includeExcel: false,
      includeReportHtml: true,
    }))
    expect(zip.files['reports/Monthly Report.html']).toBeDefined()
    expect(zip.files['reports/Quarterly Summary.html']).toBeDefined()
  })

  it('calls onProgress callback with status updates', async () => {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      nodes: {},
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    const onProgress = vi.fn()

    await exportProjectAsZip('test-project', {
      includeExcel: false,
      includeReportHtml: false,
      onProgress,
    })
    expect(onProgress).toHaveBeenCalled()
    expect(onProgress).toHaveBeenCalledWith(expect.any(String), expect.any(Number))
    const calls = onProgress.mock.calls
    expect(calls[0][1]).toBeLessThan(calls[calls.length - 1][1])
  })

  it('exports derived tables by materializing them', async () => {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      nodes: {
        table_1: createMockSourceTableNode('table_1', 'Source'),
        table_2: createMockDerivedTableNode('table_2', 'Derived', 'table_1'),
      },
      edges: {
        edge_1: {
          id: 'edge_1',
          fromNodeId: 'table_1',
          toNodeId: 'table_2',
          transformType: 'filter' as const,
        },
      },
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadFile).mockResolvedValue(createCSVContent([
      { ID: '1', Value: 100 },
      { ID: '2', Value: 200 },
    ]))
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    vi.mocked(materializationService.ensureTableMaterialized).mockResolvedValue({
      status: 'computed',
      tableId: 'table_2',
    })
    vi.mocked(materializationService.getTableData).mockResolvedValue({
      rows: [{ __rowId: 'r1', ID: '1', Value: 100 }],
      totalRows: 1,
    })

    const blob = await exportProjectAsZip('test-project', {
      includeExcel: true,
      includeReportHtml: false,
    })
    expect(materializationService.getTableData).toHaveBeenCalledWith(
      'table_2',
      0,
      50_000,
    )
    expect((await JSZip.loadAsync(blob)).files['data.xlsx']).toBeDefined()
  })
})
