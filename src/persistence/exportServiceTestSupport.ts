import JSZip from 'jszip'
import type { StoredProject } from './db'

export { JSZip }
export type { StoredProject }

export function createMockSourceTableNode(id: string, name: string, fileRef?: string) {
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
        { id: 'col_1', name: 'ID', type: 'string' as const, nullable: false },
        { id: 'col_2', name: 'Value', type: 'number' as const, nullable: true },
      ],
      rowCount: 3,
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }
}

export function createMockDerivedTableNode(id: string, name: string, sourceId: string) {
  return {
    id,
    kind: 'derived_table' as const,
    name,
    ui: { position: { x: 200, y: 0 } },
    plan: {
      transformDef: {
        type: 'filter' as const,
        sourceTableId: sourceId,
        conditions: [],
        logic: 'and' as const,
      },
      upstreamNodeIds: [sourceId],
    },
    schema: {
      columns: [
        { id: 'col_1', name: 'ID', type: 'string' as const, nullable: false },
        { id: 'col_2', name: 'Value', type: 'number' as const, nullable: true },
      ],
      rowCount: 2,
    },
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  }
}

export function createMockChartNode(id: string, name: string) {
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

export function createMockReport(id: string, name: string) {
  return {
    id,
    name,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    tiptapContent: {
      type: 'doc' as const,
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

export function createCSVContent(rows: Record<string, unknown>[]): ArrayBuffer {
  if (rows.length === 0) return new TextEncoder().encode('').buffer
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(header => row[header]).join(',')),
  ]
  return new TextEncoder().encode(lines.join('\n')).buffer
}
