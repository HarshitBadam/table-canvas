import { describe, expect, it } from 'vitest'
import type { ProjectNode, SourceTableNode } from '@/types'
import { withoutRuntimeNodeState } from '@/state/document/transientProjectState'

function sourceTable(id: string, fileRef: string): SourceTableNode {
  return {
    id,
    kind: 'source_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schema: { columns: [], rowCount: 0 },
    plan: {
      fileRef,
      fileName: `${id}.csv`,
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
  }
}

describe('withoutRuntimeNodeState', () => {
  it('keeps completed imports while omitting imports that are still pending', () => {
    const ready = sourceTable('ready', 'file-ready') as SourceTableNode & {
      cacheInfo?: { phase: string }
    }
    ready.cacheInfo = { phase: 'ready' }
    const nodes: Record<string, ProjectNode> = {
      ready,
      pending: sourceTable('pending', 'pending:next-import'),
    }

    expect(withoutRuntimeNodeState(nodes)).toEqual({
      ready: sourceTable('ready', 'file-ready'),
    })
  })
})
