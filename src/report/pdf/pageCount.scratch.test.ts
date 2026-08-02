import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { buildEmbeddedDataMap } from '@/persistence/reportHtmlGenerator'
import type { ProjectNode, SourceTableNode } from '@/types'
import type { Report } from '../types'
import { buildReportDocDefinition } from './document'
import { createReportPdf } from './pdfmakeClient'

function node(id: string, columnCount: number): SourceTableNode {
  const now = new Date().toISOString()
  return {
    id,
    kind: 'source_table',
    name: 'Wide',
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: 'x', fileName: 'x.csv', fileType: 'csv', inferredSchemaVersion: 1,
    },
    schema: {
      columns: Array.from({ length: columnCount }, (_, i) => ({
        id: `c${i}`, name: `Attribute number ${i + 1}`, type: 'string' as const, nullable: true,
      })),
      rowCount: 6,
    },
    createdAt: now,
    updatedAt: now,
  }
}

function report(content: JSONContent[]): Report {
  const now = new Date().toISOString()
  return {
    id: 'r', projectId: 'p', name: 'Probe',
    tiptapContent: { type: 'doc', content },
    createdAt: now, updatedAt: now,
  }
}

const TABLE_ID = 't1'

function rows(columnCount: number) {
  return Array.from({ length: 6 }, (_, r) => {
    const row: Record<string, unknown> = { __rowId: `r${r}` }
    for (let c = 0; c < columnCount; c++) {
      row[`c${c}`] = `Value ${c} for record ${r} pending review`
    }
    return row
  })
}

const embeddedTable: JSONContent = {
  type: 'embeddedTable',
  attrs: { sourceTableId: TABLE_ID, selectedColumns: [], rowSelectionMode: 'first_n', rowLimit: 6 },
}
const paragraph: JSONContent = {
  type: 'paragraph', content: [{ type: 'text', text: 'Some narrative text.' }],
}

async function pageCount(content: JSONContent[], columnCount: number): Promise<number> {
  const nodes: Record<string, ProjectNode> = { [TABLE_ID]: node(TABLE_ID, columnCount) }
  const dataMap = buildEmbeddedDataMap([{ tableId: TABLE_ID, rows: rows(columnCount) }], nodes)
  const pdf = await createReportPdf(buildReportDocDefinition({ report: report(content), dataMap }))
  const buffer = await new Promise<Buffer>((resolve) => { pdf.getBuffer(resolve) })
  return buffer.toString('latin1').split('/Type /Page\n').length - 1
}

describe('page counts', () => {
  it('reports page counts for representative shapes', async () => {
    const shapes: [string, JSONContent[], number][] = [
      ['narrow table only', [embeddedTable], 3],
      ['wide table only', [embeddedTable], 20],
      ['text + wide table', [paragraph, embeddedTable], 20],
      ['wide table + text', [embeddedTable, paragraph], 20],
      ['two wide tables', [embeddedTable, embeddedTable], 20],
      ['text + narrow table', [paragraph, embeddedTable], 3],
    ]
    for (const [label, content, columnCount] of shapes) {
      console.log(label.padEnd(22), await pageCount(content, columnCount), 'pages')
    }
    expect(true).toBe(true)
  }, 120_000)
})
