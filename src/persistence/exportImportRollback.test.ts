import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uploadFileWithSync: vi.fn(),
  deleteFileWithSync: vi.fn(),
}))

vi.mock('./fileSync', () => ({
  uploadFileWithSync: (...args: unknown[]) => mocks.uploadFileWithSync(...args),
  deleteFileWithSync: (...args: unknown[]) => mocks.deleteFileWithSync(...args),
}))

import { parseImportFile } from './exportImport'

function sourceNode(id: string, fileRef: string) {
  return {
    id,
    kind: 'source_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    plan: {
      fileRef,
      fileName: `${id}.csv`,
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
  }
}

function importFile(nodes: Record<string, unknown>, fileIds: string[]): File {
  const files = Object.fromEntries(fileIds.map(id => [id, {
    id,
    name: `${id}.csv`,
    type: 'text/csv',
    data: btoa('value\n1'),
    createdAt: '2026-01-01',
  }]))
  return new File([JSON.stringify({
    version: '2.0.0',
    formatType: 'tablecanvas-full',
    exportedAt: '2026-01-01',
    project: {
      id: 'source',
      name: 'Imported',
      nodes,
      edges: {},
      patches: {},
    },
    files,
  })], 'project.tablecanvas.json', { type: 'application/json' })
}

describe('import file rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteFileWithSync.mockResolvedValue(undefined)
  })

  it('deletes only files created before a later upload failure', async () => {
    mocks.uploadFileWithSync
      .mockResolvedValueOnce({
        id: 'new-file-1',
        name: 'one.csv',
        contentType: 'text/csv',
      })
      .mockRejectedValueOnce(new Error('second upload failed'))
    const file = importFile({
      one: sourceNode('one', 'old-file-1'),
      two: sourceNode('two', 'old-file-2'),
    }, ['old-file-1', 'old-file-2'])

    await expect(parseImportFile(file)).rejects.toThrow('second upload failed')
    expect(mocks.deleteFileWithSync).toHaveBeenCalledOnce()
    expect(mocks.deleteFileWithSync).toHaveBeenCalledWith(
      'new-file-1',
      { strictRemote: true },
    )
  })

  it('validates workflow references before creating files', async () => {
    const file = importFile({
      source: sourceNode('source', 'old-file'),
      chart: {
        id: 'chart',
        kind: 'chart',
        name: 'Broken chart',
        ui: { position: { x: 0, y: 0 } },
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        plan: { chartType: 'bar', sourceTableId: 'missing', config: {} },
      },
    }, ['old-file'])

    await expect(parseImportFile(file)).rejects.toThrow('references a missing table')
    expect(mocks.uploadFileWithSync).not.toHaveBeenCalled()
  })
})
