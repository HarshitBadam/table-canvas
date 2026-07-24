import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import {
  createCSVContent,
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
vi.mock('@/engine/tableDataService', () => ({
  getTableData: vi.fn(),
}))

import * as db from './db'
import { exportProjectAsZip } from './exportService'

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportProjectAsZip names and options', () => {
  it('handles tables with duplicate names by making sheet names unique', async () => {
    const project = {
      id: 'dup-names',
      name: 'Duplicate Names Project',
      nodes: {
        table_1: createMockSourceTableNode('table_1', 'Sales'),
        table_2: createMockSourceTableNode('table_2', 'Sales'),
        table_3: createMockSourceTableNode('table_3', 'Sales'),
      },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadFile).mockResolvedValue(createCSVContent([{ ID: '1', Value: 100 }]))
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    const blob = await exportProjectAsZip('dup-names', { includeExcel: true })
    expect(blob).toBeInstanceOf(Blob)
    expect((await JSZip.loadAsync(blob)).files['data.xlsx']).toBeDefined()
  })

  it('handles table names with special characters', async () => {
    const project = {
      id: 'special-chars',
      name: 'Special Chars Project',
      nodes: {
        table_1: createMockSourceTableNode('table_1', 'Sales [2024]'),
        table_2: createMockSourceTableNode('table_2', 'Data:Report*Test?'),
      },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadFile).mockResolvedValue(createCSVContent([{ ID: '1', Value: 100 }]))
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    expect(await exportProjectAsZip('special-chars', { includeExcel: true })).toBeInstanceOf(Blob)
  })

  it('handles very long table names (Excel 31 char limit)', async () => {
    const project = {
      id: 'long-name',
      name: 'Long Name Project',
      nodes: {
        table_1: createMockSourceTableNode(
          'table_1',
          'This is a very long table name that exceeds the Excel sheet name limit of 31 characters',
        ),
      },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadFile).mockResolvedValue(createCSVContent([{ ID: '1', Value: 100 }]))
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    expect(await exportProjectAsZip('long-name', { includeExcel: true })).toBeInstanceOf(Blob)
  })

  it('skips Excel generation when includeExcel is false', async () => {
    const project = {
      id: 'no-excel',
      name: 'No Excel Project',
      nodes: { table_1: createMockSourceTableNode('table_1', 'Data') },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    const zip = await JSZip.loadAsync(await exportProjectAsZip('no-excel', {
      includeExcel: false,
    }))
    expect(zip.files['project.tablecanvas.json']).toBeDefined()
    expect(zip.files['data.xlsx']).toBeUndefined()
    expect(db.loadFile).not.toHaveBeenCalled()
  })

  it('skips reports when includeReportHtml is false', async () => {
    const project = {
      id: 'no-reports',
      name: 'No Reports Project',
      nodes: {},
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({
      r1: createMockReport('r1', 'Skipped Report'),
    })
    const zip = await JSZip.loadAsync(await exportProjectAsZip('no-reports', {
      includeReportHtml: false,
    }))
    expect(zip.files['reports/']).toBeUndefined()
  })
})
