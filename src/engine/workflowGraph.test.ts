import { describe, expect, it } from 'vitest'
import type { Edge, ProjectNode } from '@/types'
import { getDependentNodeIds, getTransformSourceTableIds } from './workflowGraph'

const now = new Date().toISOString()
const source = (id: string): ProjectNode => ({
  id,
  kind: 'source_table',
  name: id,
  ui: { position: { x: 0, y: 0 } },
  plan: {
    fileRef: '',
    fileName: '',
    fileType: 'csv',
    inferredSchemaVersion: 1,
  },
  createdAt: now,
  updatedAt: now,
})

describe('workflow graph integrity', () => {
  it('returns every source for multi-input transforms', () => {
    expect(getTransformSourceTableIds({
      type: 'join',
      leftTableId: 'left',
      rightTableId: 'right',
      leftKey: 'id',
      rightKey: 'id',
      joinType: 'inner',
    })).toEqual(['left', 'right'])
    expect(getTransformSourceTableIds({
      type: 'union',
      sourceTableIds: ['a', 'b', 'a'],
    })).toEqual(['a', 'b'])
  })

  it('finds transitive dependents even when an edge is missing', () => {
    const nodes: Record<string, ProjectNode> = {
      source: source('source'),
      derived: {
        id: 'derived',
        kind: 'derived_table',
        name: 'derived',
        ui: { position: { x: 1, y: 0 } },
        plan: {
          transformDef: {
            type: 'filter',
            sourceTableId: 'source',
            conditions: [],
            logic: 'and',
          },
          upstreamNodeIds: ['source'],
        },
        createdAt: now,
        updatedAt: now,
      },
      chart: {
        id: 'chart',
        kind: 'chart',
        name: 'chart',
        ui: { position: { x: 2, y: 0 } },
        plan: {
          chartType: 'bar',
          sourceTableId: 'derived',
          config: {},
        },
        createdAt: now,
        updatedAt: now,
      },
    }
    const edges: Record<string, Edge> = {}

    expect([...getDependentNodeIds(nodes, edges, 'source')].sort()).toEqual([
      'chart',
      'derived',
    ])
  })
})
