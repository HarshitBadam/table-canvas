import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import {
  createCSVContent,
  createMockDerivedTableNode,
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
vi.mock('@/state/dataStore', () => ({
  useDataStore: { getState: vi.fn(() => ({ tableData: {} })) },
}))

import * as db from './db'
import * as materializationService from '@/engine/materializationService'
import { useDataStore } from '@/state/dataStore'
import {
  downloadBlob,
  exportAndDownloadProject,
  exportProjectAsZip,
} from './exportService'

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadBlob', () => {
  it('creates download link and triggers click', () => {
    const click = vi.fn()
    const anchor = { href: '', download: '', click }
    const append = vi.spyOn(document.body, 'appendChild')
      .mockImplementation(() => anchor as unknown as Node)
    const remove = vi.spyOn(document.body, 'removeChild')
      .mockImplementation(() => anchor as unknown as Node)
    const create = vi.spyOn(document, 'createElement')
      .mockReturnValue(anchor as unknown as HTMLAnchorElement)
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const blob = new Blob(['test content'], { type: 'text/plain' })

    downloadBlob(blob, 'test-file.txt')
    expect(createUrl).toHaveBeenCalledWith(blob)
    expect(anchor.href).toBe('blob:test-url')
    expect(anchor.download).toBe('test-file.txt')
    expect(click).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:test-url')

    append.mockRestore()
    remove.mockRestore()
    create.mockRestore()
    createUrl.mockRestore()
    revoke.mockRestore()
  })
})

describe('exportAndDownloadProject', () => {
  it('creates ZIP and triggers download with formatted filename', async () => {
    const project = {
      id: 'test-project',
      name: 'My Project',
      nodes: {},
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor as unknown as Node)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchor as unknown as Node)
    vi.spyOn(document, 'createElement')
      .mockReturnValue(anchor as unknown as HTMLAnchorElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    await exportAndDownloadProject('test-project', 'My Project')
    expect(anchor.click).toHaveBeenCalled()
    expect(anchor.download).toMatch(/^My_Project_\d{4}-\d{2}-\d{2}\.tablecanvas\.zip$/)
  })

  it('sanitizes project name in filename', async () => {
    const project = {
      id: 'test-project',
      name: 'My Project!@#$%',
      nodes: {},
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor as unknown as Node)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchor as unknown as Node)
    vi.spyOn(document, 'createElement')
      .mockReturnValue(anchor as unknown as HTMLAnchorElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    await exportAndDownloadProject('test-project', 'My Project!@#$%')
    expect(anchor.download).not.toContain('!')
    expect(anchor.download).not.toContain('@')
    expect(anchor.download).not.toContain('#')
  })
})

describe('Canonical table reads', () => {
  it('does not bypass the materialization API when rows are empty', async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      tableData: { table_2: { rows: [{ ID: 'store-1', Value: 999 }] } },
    } as unknown as ReturnType<typeof useDataStore.getState>)
    const project = {
      id: 'fallback-test',
      name: 'Fallback Test',
      nodes: {
        table_1: createMockSourceTableNode('table_1', 'Source'),
        table_2: createMockDerivedTableNode('table_2', 'Derived', 'table_1'),
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
    vi.mocked(materializationService.ensureTableMaterialized).mockResolvedValue({
      status: 'computed',
      tableId: 'table_2',
    })
    vi.mocked(materializationService.getTableData).mockResolvedValue({
      rows: [],
      totalRows: 0,
    })

    const blob = await exportProjectAsZip('fallback-test', {
      includeExcel: true,
      includeReportHtml: false,
    })
    expect(useDataStore.getState).not.toHaveBeenCalled()
    expect(materializationService.getTableData).toHaveBeenCalledWith(
      'table_2',
      0,
      1_000_000,
    )
    expect(blob).toBeInstanceOf(Blob)
  })
})

describe('File Parsing', () => {
  it('parses CSV data correctly', async () => {
    const project = {
      id: 'csv-test',
      name: 'CSV Test',
      nodes: {
        table_1: {
          ...createMockSourceTableNode('table_1', 'People'),
          schema: {
            columns: [
              { id: 'col_1', name: 'Name', type: 'string', nullable: false },
              { id: 'col_2', name: 'Age', type: 'number', nullable: false },
              { id: 'col_3', name: 'City', type: 'string', nullable: false },
            ],
            rowCount: 2,
          },
        },
      },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadFile).mockResolvedValue(
      new TextEncoder().encode('Name,Age,City\nAlice,30,NYC\nBob,25,LA').buffer,
    )
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    const blob = await exportProjectAsZip('csv-test', {
      includeExcel: true,
      includeReportHtml: false,
    })
    expect(blob).toBeInstanceOf(Blob)
    expect((await JSZip.loadAsync(blob)).files['data.xlsx']).toBeDefined()
  })

  it('handles Excel source files', async () => {
    const project = {
      id: 'xlsx-test',
      name: 'Excel Test',
      nodes: {
        table_1: {
          ...createMockSourceTableNode('table_1', 'Excel Data'),
          plan: {
            fileRef: 'file_1',
            fileName: 'data.xlsx',
            fileType: 'xlsx' as const,
            sheetName: 'Sheet1',
            inferredSchemaVersion: 1,
          },
        },
      },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadFile).mockResolvedValue(null)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    expect(await exportProjectAsZip('xlsx-test', { includeExcel: true })).toBeInstanceOf(Blob)
  })
})
