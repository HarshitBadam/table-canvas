import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkbookSheet, readWorkbook } from '@/engine/fileParsers'
import {
  buildEmbeddedDataMap,
  collectEmbeddedTableIds,
  generateReportHtml,
} from '@/persistence/reportHtmlGenerator'
import type { Report } from './types'
import {
  aggregateReportChartRows,
  formatReportCell,
  MAX_EMBEDDED_TABLE_ROWS,
  MAX_REPORT_CHART_ROWS,
  resolveDisplayColumns,
  selectRows,
} from './editor/tableData'
import type { ProjectNode, SourceTableNode } from '@/types'

const workbookPath = resolve(
  process.cwd(),
  process.env.SAMPLE_WORKBOOK || 'data/sample_workbook.xlsx',
)
const workbookExists = existsSync(workbookPath)

function sourceNode(
  id: string,
  name: string,
  schema: SourceTableNode['schema'],
): SourceTableNode {
  const now = new Date().toISOString()
  return {
    id,
    kind: 'source_table',
    name,
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: 'sample-workbook',
      fileName: 'sample_workbook.xlsx',
      fileType: 'xlsx',
      sheetName: name,
      inferredSchemaVersion: 1,
    },
    schema,
    createdAt: now,
    updatedAt: now,
  }
}

function embeddedReport(
  tableId: string,
  sheetName: string,
  xAxis: string,
  yAxis: string,
): Report {
  const now = new Date().toISOString()
  return {
    id: `report-${tableId}`,
    projectId: 'sample-project',
    name: `${sheetName} report`,
    tiptapContent: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: `${sheetName} report` }],
        },
        {
          type: 'embeddedTable',
          attrs: {
            sourceTableId: tableId,
            selectedColumns: [],
            rowSelectionMode: 'first_n',
            rowLimit: 5,
          },
        },
        {
          type: 'chartBlock',
          attrs: {
            sourceTableId: tableId,
            chartType: 'bar',
            config: {
              xAxis,
              yAxis,
              aggregation: 'sum',
              title: `${sheetName} summary`,
            },
          },
        },
      ],
    },
    createdAt: now,
    updatedAt: now,
  }
}

describe.skipIf(!workbookExists)('sample workbook report audit', () => {
  const bytes = readFileSync(workbookPath)
  const workbook = readWorkbook(Uint8Array.from(bytes).buffer)

  it('supports report tables, charts, formatting, and exports for every sheet', () => {
    expect(workbook.SheetNames).toHaveLength(8)

    for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
      const { schema, rows } = parseWorkbookSheet(workbook, sheetName)
      const tableId = `sample-table-${sheetIndex}`
      const tableNode = sourceNode(tableId, sheetName, schema)
      const nodes: Record<string, ProjectNode> = { [tableId]: tableNode }

      expect(rows.length, `${sheetName}: rows`).toBeGreaterThan(0)
      expect(schema.columns.length, `${sheetName}: columns`).toBeGreaterThan(0)
      expect(schema.rowCount, `${sheetName}: schema row count`).toBe(rows.length)
      expect(new Set(schema.columns.map(column => column.id)).size).toBe(schema.columns.length)

      expect(selectRows(rows, 'first_n', 3)).toEqual(rows.slice(0, 3))
      expect(selectRows(rows, 'last_n', 3)).toEqual(rows.slice(-3))
      expect(resolveDisplayColumns(['stale-column'], schema.columns)).toEqual(schema.columns)

      for (const row of rows) {
        for (const column of schema.columns) {
          const formatted = formatReportCell(row[column.id], column)
          expect(formatted, `${sheetName}: ${column.name} formatting`).not.toContain('Invalid')
        }
      }

      const xAxis = schema.columns.find(column =>
        column.type === 'string' || column.type === 'date' || column.type === 'datetime'
      )
      const yAxis = schema.columns.find(column => column.type === 'number')
      expect(xAxis, `${sheetName}: chart category/date column`).toBeDefined()
      expect(yAxis, `${sheetName}: chart numeric column`).toBeDefined()

      for (const aggregation of ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'] as const) {
        const chartRows = aggregateReportChartRows(
          rows,
          xAxis!.id,
          yAxis!.id,
          aggregation,
        )
        expect(chartRows.length, `${sheetName}: ${aggregation} chart rows`).toBeGreaterThan(0)
        expect(chartRows.length).toBeLessThanOrEqual(rows.length)
        expect(chartRows.every(row => Number.isFinite(Number(row[yAxis!.id])))).toBe(true)
      }

      const report = embeddedReport(tableId, sheetName, xAxis!.id, yAxis!.id)
      const references = collectEmbeddedTableIds(report.tiptapContent!)
      expect(references.map(reference => reference.tableId)).toEqual([tableId, tableId])

      const dataMap = buildEmbeddedDataMap([{ tableId, rows }], nodes)
      const html = generateReportHtml(report, dataMap)
      expect(html, `${sheetName}: HTML document`).toContain('<!DOCTYPE html>')
      expect(html, `${sheetName}: embedded table`).toContain('<table')
      expect(html, `${sheetName}: rendered chart`).toContain('class="report-chart"')
      expect(html, `${sheetName}: chart source`).toContain(`Source: ${sheetName}`)
      expect(html, `${sheetName}: first column`).toContain(schema.columns[0].name)
    }
  })

  it('keeps report data limits explicit and bounded', () => {
    expect(MAX_EMBEDDED_TABLE_ROWS).toBe(1_000)
    expect(MAX_REPORT_CHART_ROWS).toBe(5_000)
    expect(MAX_REPORT_CHART_ROWS).toBeGreaterThan(MAX_EMBEDDED_TABLE_ROWS)
  })
})
