import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import {
  createCSVContent,
  createMockChartNode,
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
vi.mock('@/engine/tableDataService', () => ({
  getTableData: vi.fn(),
}))

import * as db from './db'
import * as materializationService from '@/engine/tableDataService'
import { exportProjectAsZip } from './exportService'

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportProjectAsZip table edge cases', () => {
  it('handles project with no tables gracefully', async () => {
    const project = {
      id: 'empty-project',
      name: 'Empty Project',
      nodes: {},
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})

    const blob = await exportProjectAsZip('empty-project', { includeExcel: true })
    expect(blob).toBeInstanceOf(Blob)
    const zip = await JSZip.loadAsync(blob)
    expect(zip.files['project.tablecanvas.json']).toBeDefined()
    expect(zip.files['data.xlsx']).toBeUndefined()
  })

  it('handles project with only chart nodes (no tables)', async () => {
    const project = {
      id: 'chart-only',
      name: 'Chart Only Project',
      nodes: { chart_1: createMockChartNode('chart_1', 'My Chart') },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    const zip = await JSZip.loadAsync(await exportProjectAsZip('chart-only', {
      includeExcel: true,
    }))
    expect(zip.files['data.xlsx']).toBeUndefined()
  })

  it('handles missing source file data gracefully', async () => {
    const project = {
      id: 'missing-file',
      name: 'Missing File Project',
      nodes: {
        table_1: createMockSourceTableNode('table_1', 'Missing Data', 'nonexistent_file'),
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
    const blob = await exportProjectAsZip('missing-file', { includeExcel: true })
    expect(blob).toBeInstanceOf(Blob)
    expect((await JSZip.loadAsync(blob)).files['data.xlsx']).toBeDefined()
  })

  it('handles source table with no fileRef', async () => {
    const table = {
      ...createMockSourceTableNode('table_1', 'No File'),
      plan: {
        fileRef: '',
        fileName: 'data.csv',
        fileType: 'csv' as const,
        inferredSchemaVersion: 1,
      },
    }
    const project = {
      id: 'no-fileref',
      name: 'No FileRef Project',
      nodes: { table_1: table },
      edges: {},
      patches: {},
    }
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(project)], { type: 'application/json' }),
    )
    vi.mocked(db.loadProject).mockResolvedValue(project as unknown as StoredProject)
    vi.mocked(db.loadReportsForProject).mockResolvedValue({})
    expect(await exportProjectAsZip('no-fileref', { includeExcel: true })).toBeInstanceOf(Blob)
  })

  it('handles derived table materialization error gracefully', async () => {
    const project = {
      id: 'mat-error',
      name: 'Materialization Error Project',
      nodes: {
        table_1: createMockSourceTableNode('table_1', 'Source'),
        table_2: createMockDerivedTableNode('table_2', 'Failed Derived', 'table_1'),
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
      status: 'error',
      tableId: 'table_2',
      error: 'Upstream table not found',
    })
    const blob = await exportProjectAsZip('mat-error', { includeExcel: true })
    expect(blob).toBeInstanceOf(Blob)
    expect((await JSZip.loadAsync(blob)).files['data.xlsx']).toBeDefined()
  })
})
