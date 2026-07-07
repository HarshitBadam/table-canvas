/**
 * Unit tests for Export Service
 * 
 * Tests the full project export functionality including:
 * - ZIP archive creation with project JSON
 * - Excel workbook generation with table data
 * - Report HTML export
 * - Helper functions (sheet name sanitization, TipTap/block to HTML)
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

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

// ============================================================================
// Mocks
// ============================================================================

// Mock the db module
vi.mock('./db', () => ({
  exportProjectFile: vi.fn(),
  loadProject: vi.fn(),
  loadAllReports: vi.fn(),
  loadFile: vi.fn(),
}))

// Mock the materialization service. getTableData is the single canonical,
// id-keyed read API that the export service now relies on for every table.
vi.mock('@/engine/materializationService', () => ({
  getTableData: vi.fn(),
  ensureTableMaterialized: vi.fn(),
}))

// Import after mocks are set up
import {
  exportProjectAsZip,
  downloadBlob,
  exportAndDownloadProject,
  type ZipExportOptions,
} from './exportService'
import * as db from './db'
import * as materializationService from '@/engine/materializationService'

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSourceTableNode(id: string, name: string, fileRef?: string) {
  return {
    id,
    kind: 'source_table' as const,
    name,
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: fileRef || `file_${id}`,
      fileName: `${name}.csv`,
      fileType: 'csv' as const,
      inferredSchemaVersion: 1,
    },
    schema: {
      columns: [
        { id: 'col_1', name: 'ID', type: 'string', nullable: false },
        { id: 'col_2', name: 'Value', type: 'number', nullable: true },
      ],
      rowCount: 3,
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }
}

function createMockDerivedTableNode(id: string, name: string, sourceId: string) {
  return {
    id,
    kind: 'derived_table' as const,
    name,
    ui: { position: { x: 200, y: 0 } },
    plan: {
      transformDef: {
        type: 'filter',
        sourceTableId: sourceId,
        conditions: [],
        logic: 'and',
      },
      upstreamNodeIds: [sourceId],
    },
    schema: {
      columns: [
        { id: 'col_1', name: 'ID', type: 'string', nullable: false },
        { id: 'col_2', name: 'Value', type: 'number', nullable: true },
      ],
      rowCount: 2,
    },
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  }
}

function createMockChartNode(id: string, name: string) {
  return {
    id,
    kind: 'chart' as const,
    name,
    ui: { position: { x: 400, y: 0 } },
    plan: {
      sourceTableId: 'table_1',
      config: { type: 'bar' },
    },
    createdAt: '2024-01-03T00:00:00.000Z',
    updatedAt: '2024-01-03T00:00:00.000Z',
  }
}

function createMockReport(id: string, name: string) {
  return {
    id,
    name,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    tiptapContent: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Report Title' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'This is ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' text.' },
          ],
        },
      ],
    },
  }
}

function createCSVContent(rows: Record<string, unknown>[]): ArrayBuffer {
  if (rows.length === 0) return new TextEncoder().encode('').buffer
  
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => row[h]).join(',')),
  ]
  return new TextEncoder().encode(lines.join('\n')).buffer
}

/**
 * Read a worksheet from an exported ZIP's data.xlsx as an array-of-arrays.
 * Used to assert the actual exported cell content (not just that a sheet exists).
 */
async function readExportedSheet(zipBlob: Blob, sheetName: string): Promise<unknown[][]> {
  const zip = await JSZip.loadAsync(zipBlob)
  const xlsxFile = zip.files['data.xlsx']
  if (!xlsxFile) throw new Error('data.xlsx not found in export')
  const buffer = await xlsxFile.async('arraybuffer')
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`)
  return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error - fake-indexeddb global assignment
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// exportProjectAsZip - Happy Path Tests
// ============================================================================

describe('exportProjectAsZip', () => {
  describe('Happy Path', () => {
    it('creates a ZIP blob with project.tablecanvas.json', async () => {
      // Arrange
      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        nodes: {},
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act
      const zipBlob = await exportProjectAsZip('test-project', {
        includeExcel: false,
        includeReportHtml: false,
      })

      // Assert
      expect(zipBlob).toBeInstanceOf(Blob)
      expect(zipBlob.size).toBeGreaterThan(0)

      // Verify ZIP contents
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['project.tablecanvas.json']).toBeDefined()
    })

    it('includes data.xlsx when includeExcel is true with source tables', async () => {
      // Arrange
      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        nodes: {
          table_1: createMockSourceTableNode('table_1', 'Sales Data', 'file_1'),
        },
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})
      // The data store is the single source of truth: rows are keyed by column id.
      vi.mocked(materializationService.getTableData).mockResolvedValue({
        rows: [
          { __rowId: 'row_0', col_1: '1', col_2: 100 },
          { __rowId: 'row_1', col_1: '2', col_2: 200 },
          { __rowId: 'row_2', col_1: '3', col_2: 300 },
        ],
        totalRows: 3,
      })

      // Act
      const zipBlob = await exportProjectAsZip('test-project', {
        includeExcel: true,
        includeReportHtml: false,
      })

      // Assert
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['project.tablecanvas.json']).toBeDefined()
      expect(zip.files['data.xlsx']).toBeDefined()

      // The sheet must contain the human-readable headers and the id-keyed cells.
      const sheet = await readExportedSheet(zipBlob, 'Sales Data')
      expect(sheet[0]).toEqual(['ID', 'Value'])
      expect(sheet[1]).toEqual(['1', 100])
      expect(sheet[3]).toEqual(['3', 300])
    })

    it('includes reports folder when includeReportHtml is true', async () => {
      // Arrange
      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        nodes: {},
        edges: {},
        patches: {},
      }

      const mockReports = {
        report_1: createMockReport('report_1', 'Monthly Report'),
        report_2: createMockReport('report_2', 'Quarterly Summary'),
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue(mockReports)

      // Act
      const zipBlob = await exportProjectAsZip('test-project', {
        includeExcel: false,
        includeReportHtml: true,
      })

      // Assert
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['reports/Monthly Report.html']).toBeDefined()
      expect(zip.files['reports/Quarterly Summary.html']).toBeDefined()
    })

    it('calls onProgress callback with status updates', async () => {
      // Arrange
      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        nodes: {},
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      const progressCallback = vi.fn()

      // Act
      await exportProjectAsZip('test-project', {
        includeExcel: false,
        includeReportHtml: false,
        onProgress: progressCallback,
      })

      // Assert
      expect(progressCallback).toHaveBeenCalled()
      expect(progressCallback).toHaveBeenCalledWith(expect.any(String), expect.any(Number))
      
      // Should have progress at start and end
      const calls = progressCallback.mock.calls
      expect(calls[0][1]).toBeLessThan(calls[calls.length - 1][1])
    })

    it('exports derived tables by materializing them', async () => {
      // Arrange - both source and derived tables are read via getTableData,
      // which returns id-keyed rows (col_1, col_2) from the data store.
      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        nodes: {
          table_1: createMockSourceTableNode('table_1', 'Source'),
          table_2: createMockDerivedTableNode('table_2', 'Derived', 'table_1'),
        },
        edges: {
          edge_1: { id: 'edge_1', fromNodeId: 'table_1', toNodeId: 'table_2', transformType: 'filter' },
        },
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})
      vi.mocked(materializationService.getTableData).mockImplementation(async (tableId: string) => {
        if (tableId === 'table_1') {
          return {
            rows: [
              { __rowId: 'row_0', col_1: '1', col_2: 100 },
              { __rowId: 'row_1', col_1: '2', col_2: 200 },
            ],
            totalRows: 2,
          }
        }
        // Derived table (filtered) - the regression was these coming out EMPTY.
        return {
          rows: [{ __rowId: 'derived_row_0', col_1: '1', col_2: 100 }],
          totalRows: 1,
        }
      })

      // Act
      const zipBlob = await exportProjectAsZip('test-project', {
        includeExcel: true,
        includeReportHtml: false,
      })

      // Assert - getTableData is the single read path for every table.
      expect(materializationService.getTableData).toHaveBeenCalledWith('table_1', 0, 1_000_000)
      expect(materializationService.getTableData).toHaveBeenCalledWith('table_2', 0, 1_000_000)

      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['data.xlsx']).toBeDefined()

      // The derived sheet must NOT be empty and must contain the mapped cells.
      const derivedSheet = await readExportedSheet(zipBlob, 'Derived')
      expect(derivedSheet[0]).toEqual(['ID', 'Value'])
      expect(derivedSheet[1]).toEqual(['1', 100])
    })
  })

  describe('Edge Cases', () => {
    it('handles project with no tables gracefully', async () => {
      // Arrange
      const mockProject = {
        id: 'empty-project',
        name: 'Empty Project',
        nodes: {},
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act - should not throw
      const zipBlob = await exportProjectAsZip('empty-project', {
        includeExcel: true,
      })

      // Assert
      expect(zipBlob).toBeInstanceOf(Blob)
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['project.tablecanvas.json']).toBeDefined()
      // No data.xlsx because no tables
      expect(zip.files['data.xlsx']).toBeUndefined()
    })

    it('handles project with only chart nodes (no tables)', async () => {
      // Arrange
      const mockProject = {
        id: 'chart-only',
        name: 'Chart Only Project',
        nodes: {
          chart_1: createMockChartNode('chart_1', 'My Chart'),
        },
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act
      const zipBlob = await exportProjectAsZip('chart-only', {
        includeExcel: true,
      })

      // Assert
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['data.xlsx']).toBeUndefined()
    })

    it('handles missing source file data gracefully', async () => {
      // Arrange
      const mockProject = {
        id: 'missing-file',
        name: 'Missing File Project',
        nodes: {
          table_1: createMockSourceTableNode('table_1', 'Missing Data', 'nonexistent_file'),
        },
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadFile).mockResolvedValue(null) // File not found
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act - should not throw
      const zipBlob = await exportProjectAsZip('missing-file', {
        includeExcel: true,
      })

      // Assert
      expect(zipBlob).toBeInstanceOf(Blob)
      const zip = await JSZip.loadAsync(zipBlob)
      // Should still have Excel with empty sheet
      expect(zip.files['data.xlsx']).toBeDefined()
    })

    it('handles source table with no fileRef', async () => {
      // Arrange
      const tableWithoutFileRef = {
        ...createMockSourceTableNode('table_1', 'No File'),
        plan: {
          fileRef: '', // Empty fileRef
          fileName: 'data.csv',
          fileType: 'csv' as const,
          inferredSchemaVersion: 1,
        },
      }

      const mockProject = {
        id: 'no-fileref',
        name: 'No FileRef Project',
        nodes: { table_1: tableWithoutFileRef },
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act
      const zipBlob = await exportProjectAsZip('no-fileref', {
        includeExcel: true,
      })

      // Assert - should not throw, should produce valid ZIP
      expect(zipBlob).toBeInstanceOf(Blob)
    })

    it('handles derived table materialization error gracefully', async () => {
      // Arrange
      const mockProject = {
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
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})
      // getTableData surfaces the materialization error for the derived table.
      vi.mocked(materializationService.getTableData).mockImplementation(async (tableId: string) => {
        if (tableId === 'table_1') {
          return { rows: [{ __rowId: 'row_0', col_1: '1', col_2: 100 }], totalRows: 1 }
        }
        return { rows: [], totalRows: 0, error: 'Upstream table not found' }
      })

      // Act - should not throw
      const zipBlob = await exportProjectAsZip('mat-error', {
        includeExcel: true,
      })

      // Assert
      expect(zipBlob).toBeInstanceOf(Blob)
      // Excel should still be generated with an error sheet for the failed table.
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['data.xlsx']).toBeDefined()
      const errorSheet = await readExportedSheet(zipBlob, 'Failed Derived')
      expect(String(errorSheet[1]?.[0])).toContain('Error')
    })

    it('handles tables with duplicate names by making sheet names unique', async () => {
      // Arrange
      const mockProject = {
        id: 'dup-names',
        name: 'Duplicate Names Project',
        nodes: {
          table_1: createMockSourceTableNode('table_1', 'Sales'),
          table_2: createMockSourceTableNode('table_2', 'Sales'), // Same name
          table_3: createMockSourceTableNode('table_3', 'Sales'), // Same name again
        },
        edges: {},
        patches: {},
      }

      const csvData = [{ ID: '1', Value: 100 }]
      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadFile).mockResolvedValue(createCSVContent(csvData))
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act
      const zipBlob = await exportProjectAsZip('dup-names', {
        includeExcel: true,
      })

      // Assert - should create unique sheet names
      expect(zipBlob).toBeInstanceOf(Blob)
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['data.xlsx']).toBeDefined()
    })

    it('handles table names with special characters', async () => {
      // Arrange
      const mockProject = {
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
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadFile).mockResolvedValue(createCSVContent([{ ID: '1', Value: 100 }]))
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act - should sanitize sheet names
      const zipBlob = await exportProjectAsZip('special-chars', {
        includeExcel: true,
      })

      // Assert
      expect(zipBlob).toBeInstanceOf(Blob)
    })

    it('handles very long table names (Excel 31 char limit)', async () => {
      // Arrange
      const longName = 'This is a very long table name that exceeds the Excel sheet name limit of 31 characters'
      const mockProject = {
        id: 'long-name',
        name: 'Long Name Project',
        nodes: {
          table_1: createMockSourceTableNode('table_1', longName),
        },
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadFile).mockResolvedValue(createCSVContent([{ ID: '1', Value: 100 }]))
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act
      const zipBlob = await exportProjectAsZip('long-name', {
        includeExcel: true,
      })

      // Assert - should truncate to 31 chars
      expect(zipBlob).toBeInstanceOf(Blob)
    })

    it('skips Excel generation when includeExcel is false', async () => {
      // Arrange
      const mockProject = {
        id: 'no-excel',
        name: 'No Excel Project',
        nodes: {
          table_1: createMockSourceTableNode('table_1', 'Data'),
        },
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act
      const zipBlob = await exportProjectAsZip('no-excel', {
        includeExcel: false,
      })

      // Assert
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['project.tablecanvas.json']).toBeDefined()
      expect(zip.files['data.xlsx']).toBeUndefined()
      // Should not have called loadFile since Excel is disabled
      expect(db.loadFile).not.toHaveBeenCalled()
    })

    it('skips reports when includeReportHtml is false', async () => {
      // Arrange
      const mockProject = {
        id: 'no-reports',
        name: 'No Reports Project',
        nodes: {},
        edges: {},
        patches: {},
      }

      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(mockProject)
      vi.mocked(db.loadAllReports).mockResolvedValue({
        r1: createMockReport('r1', 'Skipped Report'),
      })

      // Act
      const zipBlob = await exportProjectAsZip('no-reports', {
        includeReportHtml: false,
      })

      // Assert
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['reports/']).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    it('throws when project does not exist', async () => {
      // Arrange
      vi.mocked(db.exportProjectFile).mockRejectedValue(new Error('Project not found'))

      // Act & Assert
      await expect(exportProjectAsZip('nonexistent')).rejects.toThrow('Project not found')
    })

    it('throws when loadProject returns null with includeExcel', async () => {
      // Arrange
      vi.mocked(db.exportProjectFile).mockResolvedValue(
        new Blob(['{}'], { type: 'application/json' })
      )
      vi.mocked(db.loadProject).mockResolvedValue(null)

      // Act & Assert
      await expect(
        exportProjectAsZip('invalid', { includeExcel: true })
      ).rejects.toThrow('Project not found')
    })
  })
})

// ============================================================================
// Report HTML Generation Tests
// ============================================================================

describe('Report HTML Generation', () => {
  it('generates HTML for reports with TipTap content', async () => {
    // Arrange
    const mockProject = {
      id: 'test',
      name: 'Test',
      nodes: {},
      edges: {},
      patches: {},
    }

    const mockReport = createMockReport('r1', 'TipTap Report')

    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadAllReports).mockResolvedValue({ r1: mockReport })

    // Act
    const zipBlob = await exportProjectAsZip('test', {
      includeExcel: false,
      includeReportHtml: true,
    })

    // Assert
    const zip = await JSZip.loadAsync(zipBlob)
    const htmlFile = zip.files['reports/TipTap Report.html']
    expect(htmlFile).toBeDefined()

    const html = await htmlFile.async('string')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<h1>Report Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('generates empty report placeholder for reports with no content', async () => {
    // Arrange
    const mockProject = {
      id: 'test',
      name: 'Test',
      nodes: {},
      edges: {},
      patches: {},
    }

    const emptyReport = {
      id: 'empty',
      name: 'Empty Report',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadAllReports).mockResolvedValue({ empty: emptyReport })

    // Act
    const zipBlob = await exportProjectAsZip('test', {
      includeExcel: false,
      includeReportHtml: true,
    })

    // Assert
    const zip = await JSZip.loadAsync(zipBlob)
    const htmlFile = zip.files['reports/Empty Report.html']
    const html = await htmlFile.async('string')
    expect(html).toContain('This report is empty')
  })

  it('sanitizes report filenames with special characters', async () => {
    // Arrange
    const mockProject = {
      id: 'test',
      name: 'Test',
      nodes: {},
      edges: {},
      patches: {},
    }

    const reportWithSpecialChars = {
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
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadAllReports).mockResolvedValue({ special: reportWithSpecialChars })

    // Act
    const zipBlob = await exportProjectAsZip('test', {
      includeExcel: false,
      includeReportHtml: true,
    })

    // Assert - filename should be sanitized
    const zip = await JSZip.loadAsync(zipBlob)
    // Filter for actual HTML files (not the folder entry)
    const htmlFiles = Object.keys(zip.files).filter(f => f.startsWith('reports/') && f.endsWith('.html'))
    expect(htmlFiles.length).toBe(1)
    // The filename (after 'reports/') should not contain special chars
    const fileName = htmlFiles[0].replace('reports/', '')
    expect(fileName).not.toContain(':')
    expect(fileName).not.toContain('<')
    expect(fileName).not.toContain('>')
  })
})

// ============================================================================
// downloadBlob Tests
// ============================================================================

describe('downloadBlob', () => {
  it('creates download link and triggers click', () => {
    // Arrange
    const mockClick = vi.fn()
    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
    }

    const mockAppendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node)
    const mockRemoveChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as Node)
    const mockCreateElement = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement)
    const mockCreateObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url')
    const mockRevokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    // Act
    const blob = new Blob(['test content'], { type: 'text/plain' })
    downloadBlob(blob, 'test-file.txt')

    // Assert
    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob)
    expect(mockAnchor.href).toBe('blob:test-url')
    expect(mockAnchor.download).toBe('test-file.txt')
    expect(mockClick).toHaveBeenCalled()
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url')

    // Cleanup
    mockAppendChild.mockRestore()
    mockRemoveChild.mockRestore()
    mockCreateElement.mockRestore()
    mockCreateObjectURL.mockRestore()
    mockRevokeObjectURL.mockRestore()
  })
})

// ============================================================================
// exportAndDownloadProject Tests
// ============================================================================

describe('exportAndDownloadProject', () => {
  it('creates ZIP and triggers download with formatted filename', async () => {
    // Arrange
    const mockProject = {
      id: 'test-project',
      name: 'My Project',
      nodes: {},
      edges: {},
      patches: {},
    }

    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadAllReports).mockResolvedValue({})

    // Mock download
    const mockClick = vi.fn()
    const mockAnchor = { href: '', download: '', click: mockClick }
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as Node)
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    // Act
    await exportAndDownloadProject('test-project', 'My Project')

    // Assert
    expect(mockClick).toHaveBeenCalled()
    expect(mockAnchor.download).toMatch(/^My_Project_\d{4}-\d{2}-\d{2}\.tablecanvas\.zip$/)
  })

  it('sanitizes project name in filename', async () => {
    // Arrange
    const mockProject = {
      id: 'test-project',
      name: 'My Project!@#$%',
      nodes: {},
      edges: {},
      patches: {},
    }

    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadAllReports).mockResolvedValue({})

    const mockAnchor = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as Node)
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    // Act
    await exportAndDownloadProject('test-project', 'My Project!@#$%')

    // Assert - filename should not contain special chars
    expect(mockAnchor.download).not.toContain('!')
    expect(mockAnchor.download).not.toContain('@')
    expect(mockAnchor.download).not.toContain('#')
  })
})

// ============================================================================
// Single Source of Truth Tests
// ============================================================================

describe('Single data source', () => {
  it('reads every table through getTableData (the id-keyed store)', async () => {
    // Arrange - a table whose data getTableData genuinely returns empty for
    // should produce an empty (headers-only) sheet, not throw or hang.
    const mockProject = {
      id: 'sot-test',
      name: 'Single Source Test',
      nodes: {
        table_1: createMockSourceTableNode('table_1', 'Source'),
        table_2: createMockDerivedTableNode('table_2', 'Derived', 'table_1'),
      },
      edges: {},
      patches: {},
    }

    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadAllReports).mockResolvedValue({})
    vi.mocked(materializationService.getTableData).mockImplementation(async (tableId: string) => {
      if (tableId === 'table_1') {
        return { rows: [{ __rowId: 'row_0', col_1: 'a', col_2: 1 }], totalRows: 1 }
      }
      return { rows: [], totalRows: 0 }
    })

    // Act
    const zipBlob = await exportProjectAsZip('sot-test', {
      includeExcel: true,
      includeReportHtml: false,
    })

    // Assert - getTableData is called for both tables; no other data path.
    expect(materializationService.getTableData).toHaveBeenCalledWith('table_1', 0, 1_000_000)
    expect(materializationService.getTableData).toHaveBeenCalledWith('table_2', 0, 1_000_000)

    const populated = await readExportedSheet(zipBlob, 'Source')
    expect(populated[0]).toEqual(['ID', 'Value'])
    expect(populated[1]).toEqual(['a', 1])

    // Empty table -> headers-only sheet.
    const empty = await readExportedSheet(zipBlob, 'Derived')
    expect(empty[0]).toEqual(['ID', 'Value'])
    expect(empty.length).toBe(1)
  })
})

// ============================================================================
// CSV and Excel Parsing Tests
// ============================================================================

describe('Excel content mapping', () => {
  it('maps id-keyed rows to named-header cells (source table)', async () => {
    // Arrange - a 3-column table; the store returns id-keyed rows.
    const mockProject = {
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
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadAllReports).mockResolvedValue({})
    vi.mocked(materializationService.getTableData).mockResolvedValue({
      rows: [
        { __rowId: 'row_0', col_1: 'Alice', col_2: 30, col_3: 'NYC' },
        { __rowId: 'row_1', col_1: 'Bob', col_2: 25, col_3: 'LA' },
      ],
      totalRows: 2,
    })

    // Act
    const zipBlob = await exportProjectAsZip('csv-test', {
      includeExcel: true,
      includeReportHtml: false,
    })

    // Assert - headers are the human-readable names, cells come from ids.
    const sheet = await readExportedSheet(zipBlob, 'People')
    expect(sheet[0]).toEqual(['Name', 'Age', 'City'])
    expect(sheet[1]).toEqual(['Alice', 30, 'NYC'])
    expect(sheet[2]).toEqual(['Bob', 25, 'LA'])
  })

  it('produces a headers-only sheet when a table has no data', async () => {
    // Arrange
    const mockProject = {
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
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadAllReports).mockResolvedValue({})
    vi.mocked(materializationService.getTableData).mockResolvedValue({
      rows: [],
      totalRows: 0,
    })

    // Act - should not throw
    const zipBlob = await exportProjectAsZip('xlsx-test', {
      includeExcel: true,
    })

    // Assert
    expect(zipBlob).toBeInstanceOf(Blob)
    const sheet = await readExportedSheet(zipBlob, 'Excel Data')
    expect(sheet[0]).toEqual(['ID', 'Value'])
    expect(sheet.length).toBe(1)
  })
})
