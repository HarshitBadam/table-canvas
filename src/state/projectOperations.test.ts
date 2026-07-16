import { describe, expect, it } from 'vitest'
import type { ProjectNode } from '@/types'
import { cloneProjectContents, nextDuplicateName } from './projectOperations'

describe('project duplication helpers', () => {
  it('chooses collision-safe names case-insensitively', () => {
    expect(nextDuplicateName('Budget', ['Budget copy', 'BUDGET COPY 2']))
      .toBe('Budget copy 3')
  })

  it('deep clones graph and reports with new IDs while sharing file references', () => {
    const nodes: Record<string, ProjectNode> = {
      source: {
        id: 'source',
        kind: 'source_table',
        name: 'Source',
        ui: { position: { x: 0, y: 0 } },
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        plan: {
          fileRef: 'shared-file',
          fileName: 'data.csv',
          fileType: 'csv',
          inferredSchemaVersion: 1,
        },
      },
      chart: {
        id: 'chart',
        kind: 'chart',
        name: 'Chart',
        ui: { position: { x: 1, y: 1 } },
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        plan: { chartType: 'bar', sourceTableId: 'source', config: {} },
      },
    }
    const clone = cloneProjectContents(nodes, {}, {
      source: { cellPatches: {}, deletedRows: new Set(), insertedRows: [] },
    }, {
      report: {
        id: 'report',
        projectId: 'original',
        name: 'Report',
        tiptapContent: {
          type: 'doc',
          content: [{ type: 'tableEmbed', attrs: { tableId: 'source' } }],
        },
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    }, 'duplicate')
    const clonedSource = Object.values(clone.nodes).find(node => node.kind === 'source_table')
    const clonedChart = Object.values(clone.nodes).find(node => node.kind === 'chart')
    const clonedReport = Object.values(clone.reports)[0]

    expect(clonedSource?.id).not.toBe('source')
    expect(clonedSource?.kind === 'source_table' && clonedSource.plan.fileRef).toBe('shared-file')
    expect(clonedChart?.kind === 'chart' && clonedChart.plan.sourceTableId).toBe(clonedSource?.id)
    expect(clonedReport.id).not.toBe('report')
    expect(clonedReport.projectId).toBe('duplicate')
    expect(clonedReport.tiptapContent?.content[0].attrs?.tableId).toBe(clonedSource?.id)

    clonedSource!.name = 'Changed'
    expect(nodes.source.name).toBe('Source')
  })
})
