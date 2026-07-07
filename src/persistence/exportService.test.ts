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

// Mock the materialization service
vi.mock('@/engine/materializationService', () => ({
  getTableData: vi.fn(),
  ensureTableMaterialized: vi.fn(),
}))

// Mock the data store
vi.mock('@/state/dataStore', () => ({
  useDataStore: {
    getState: vi.fn(() => ({
      tableData: {},
    })),
  },
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
import { useDataStore } from '@/state/dataStore'

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
      const csvData = [
        { ID: '1', Value: 100 },
        { ID: '2', Value: 200 },
        { ID: '3', Value: 300 },
      ]
      const csvBuffer = createCSVContent(csvData)

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
      vi.mocked(db.loadFile).mockResolvedValue(csvBuffer)
      vi.mocked(db.loadAllReports).mockResolvedValue({})

      // Act
      const zipBlob = await exportProjectAsZip('test-project', {
        includeExcel: true,
        includeReportHtml: false,
      })

      // Assert
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['project.tablecanvas.json']).toBeDefined()
      expect(zip.files['data.xlsx']).toBeDefined()
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
      // Arrange
      const sourceData = [
        { ID: '1', Value: 100 },
        { ID: '2', Value: 200 },
      ]
      const derivedData = [{ ID: '1', Value: 100 }]

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
      vi.mocked(db.loadFile).mockResolvedValue(createCSVContent(sourceData))
      vi.mocked(db.loadAllReports).mockResolvedValue({})
      vi.mocked(materializationService.ensureTableMaterialized).mockResolvedValue({
        status: 'fresh',
        tableId: 'table_2',
      })
      vi.mocked(materializationService.getTableData).mockResolvedValue({
        rows: derivedData,
        totalRows: 1,
      })

      // Act
      const zipBlob = await exportProjectAsZip('test-project', {
        includeExcel: true,
        includeReportHtml: false,
      })

      // Assert
      expect(materializationService.ensureTableMaterialized).toHaveBeenCalledWith('table_2')
      expect(materializationService.getTableData).toHaveBeenCalledWith('table_2', 0, 100000)
      
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['data.xlsx']).toBeDefined()
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
      vi.mocked(db.loadFile).mockResolvedValue(createCSVContent([{ ID: '1', Value: 100 }]))
      vi.mocked(db.loadAllReports).mockResolvedValue({})
      vi.mocked(materializationService.ensureTableMaterialized).mockResolvedValue({
        status: 'error',
        tableId: 'table_2',
        error: 'Upstream table not found',
      })

      // Act - should not throw
      const zipBlob = await exportProjectAsZip('mat-error', {
        includeExcel: true,
      })

      // Assert
      expect(zipBlob).toBeInstanceOf(Blob)
      // Excel should still be generated with error sheet
      const zip = await JSZip.loadAsync(zipBlob)
      expect(zip.files['data.xlsx']).toBeDefined()
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
// Data Store Fallback Tests
// ============================================================================

describe('Data Store Fallback', () => {
  it('falls back to data store when materialization returns empty rows', async () => {
    // Arrange
    const storeData = {
      table_2: {
        rows: [{ ID: 'store-1', Value: 999 }],
      },
    }

    vi.mocked(useDataStore.getState).mockReturnValue({
      tableData: storeData,
    } as ReturnType<typeof useDataStore.getState>)

    const mockProject = {
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
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadFile).mockResolvedValue(createCSVContent([{ ID: '1', Value: 100 }]))
    vi.mocked(db.loadAllReports).mockResolvedValue({})
    vi.mocked(materializationService.ensureTableMaterialized).mockResolvedValue({
      status: 'fresh',
      tableId: 'table_2',
    })
    vi.mocked(materializationService.getTableData).mockResolvedValue({
      rows: [], // Empty rows triggers fallback
      totalRows: 0,
    })

    // Act
    const zipBlob = await exportProjectAsZip('fallback-test', {
      includeExcel: true,
      includeReportHtml: false,
    })

    // Assert
    expect(useDataStore.getState).toHaveBeenCalled()
    expect(zipBlob).toBeInstanceOf(Blob)
  })
})

// ============================================================================
// CSV and Excel Parsing Tests
// ============================================================================

describe('File Parsing', () => {
  it('parses CSV data correctly', async () => {
    // Arrange
    const csvContent = 'Name,Age,City\nAlice,30,NYC\nBob,25,LA'
    const csvBuffer = new TextEncoder().encode(csvContent).buffer

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
    vi.mocked(db.loadFile).mockResolvedValue(csvBuffer)
    vi.mocked(db.loadAllReports).mockResolvedValue({})

    // Act
    const zipBlob = await exportProjectAsZip('csv-test', {
      includeExcel: true,
      includeReportHtml: false,
    })

    // Assert
    expect(zipBlob).toBeInstanceOf(Blob)
    const zip = await JSZip.loadAsync(zipBlob)
    expect(zip.files['data.xlsx']).toBeDefined()
  })

  it('handles Excel source files', async () => {
    // Arrange - Create a simple mock for xlsx file type
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

    // Note: We can't easily mock the XLSX binary format, so we return null
    // to test the graceful handling of unparseable files
    vi.mocked(db.exportProjectFile).mockResolvedValue(
      new Blob([JSON.stringify(mockProject)], { type: 'application/json' })
    )
    vi.mocked(db.loadProject).mockResolvedValue(mockProject)
    vi.mocked(db.loadFile).mockResolvedValue(null) // Simulating file not found
    vi.mocked(db.loadAllReports).mockResolvedValue({})

    // Act - should not throw
    const zipBlob = await exportProjectAsZip('xlsx-test', {
      includeExcel: true,
    })

    // Assert
    expect(zipBlob).toBeInstanceOf(Blob)
  })
})
