import { beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

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

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

export async function getDB() {
  vi.resetModules()
  return import('./db')
}

export function createMockSourceTableNode(id: string, name: string) {
  return {
    id,
    kind: 'source_table' as const,
    name,
    ui: { position: { x: 0, y: 0 } },
    plan: {
      fileRef: `file_${id}`,
      fileName: `${name}.csv`,
      fileType: 'csv' as const,
      inferredSchemaVersion: 1,
    },
    schema: {
      columns: [
        { id: 'col_1', name: 'ID', type: 'string' as const, nullable: false },
        { id: 'col_2', name: 'Value', type: 'number' as const, nullable: true },
      ],
      rowCount: 10,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createMockDerivedTableNode(id: string, name: string, upstreamIds: string[]) {
  return {
    id,
    kind: 'derived_table' as const,
    name,
    ui: { position: { x: 100, y: 100 } },
    plan: {
      transformDef: {
        type: 'filter' as const,
        sourceTableId: upstreamIds[0] || '',
        conditions: [],
        logic: 'and' as const,
      },
      upstreamNodeIds: upstreamIds,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createMockEdge(from: string, to: string) {
  return {
    id: `edge_${from}_${to}`,
    fromNodeId: from,
    toNodeId: to,
    transformType: 'filter' as const,
  }
}

export function createMockPatches() {
  return {
    cellPatches: { row_1: { col_1: 'edited value' } },
    deletedRows: new Set(['row_5']),
    insertedRows: [
      { rowId: 'row_new', values: { col_1: 'new', col_2: 100 }, insertedAt: 0 },
    ],
    highlightedCells: new Set(['row_1:col_1']),
  }
}

export function createMockReport(id: string, name: string) {
  const now = new Date().toISOString()
  return {
    id,
    name,
    tiptapContent: {
      type: 'doc' as const,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello World' }] }],
    },
    createdAt: now,
    updatedAt: now,
  }
}
