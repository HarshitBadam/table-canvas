import { beforeEach, describe, expect, it, vi } from 'vitest'

const clearProjectRuntime = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const loadReportsForProject = vi.hoisted(() => vi.fn().mockResolvedValue({}))

vi.mock('@/state/project/projectLifecycle', () => ({
  clearProjectRuntime,
}))
vi.mock('@/persistence/storage/local-db/reportStorage', () => ({
  loadReportsForProject,
}))

import type { ChartNode, DerivedTableNode, ProjectNode, SourceTableNode } from '@/types'
import type { ProjectWithSync } from '@/persistence/sync/project/projectSync'
import { prepareProjectState } from '@/state/project/projectPreparation'
import { useProjectStore } from '@/state/projectStore'
import { useReportStore } from '@/report/reportStore'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'

function sourceTable(id: string): SourceTableNode {
  return {
    id,
    kind: 'source_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schema: { columns: [], rowCount: 0 },
    plan: {
      fileRef: `file-${id}`,
      fileName: `${id}.csv`,
      fileType: 'csv',
      inferredSchemaVersion: 1,
    },
  }
}

function derivedTable(id: string, upstreamNodeIds: string[]): DerivedTableNode {
  return {
    id,
    kind: 'derived_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schema: { columns: [], rowCount: 0 },
    plan: {
      transformDef: { type: 'combine', operation: 'union' } as never,
      upstreamNodeIds,
    },
  }
}

function chart(id: string, sourceTableId: string): ChartNode {
  return {
    id,
    kind: 'chart',
    name: id,
    ui: { position: { x: 0, y: 0 } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    plan: {
      chartType: 'bar',
      sourceTableId,
      config: {},
    },
  }
}

function project(nodes: Record<string, ProjectNode>): ProjectWithSync {
  return {
    id: 'project-1',
    name: 'Test project',
    nodes,
    edges: {},
    patches: {},
  }
}

beforeEach(() => {
  clearProjectRuntime.mockClear()
  loadReportsForProject.mockClear()
  useProjectStore.setState({
    projectId: '',
    projectName: 'Untitled Project',
    nodes: {},
    edges: {},
    patches: {},
    selectedNodeId: null,
    history: { past: [], future: [] },
  })
  useReportStore.setState({
    reports: {},
    selectedReportId: null,
    activeProjectId: null,
    persistenceStatus: 'idle',
    persistenceError: null,
  })
  useTableRuntimeStore.getState().resetRuntime()
})

describe('prepareProjectState', () => {
  it('marks every source and derived table dirty so the loading state is honest on load', async () => {
    await prepareProjectState(project({
      source: sourceTable('source'),
      derived: derivedTable('derived', ['source']),
    }))

    const { cacheInfo } = useTableRuntimeStore.getState()
    expect(cacheInfo.source?.isDirty).toBe(true)
    expect(cacheInfo.derived?.isDirty).toBe(true)
  })

  it('does not mark chart nodes dirty', async () => {
    await prepareProjectState(project({
      source: sourceTable('source'),
      chart: chart('chart', 'source'),
    }))

    const { cacheInfo } = useTableRuntimeStore.getState()
    expect(cacheInfo.source?.isDirty).toBe(true)
    expect(cacheInfo.chart).toBeUndefined()
  })

  it('marks nothing dirty for a project with no tables', async () => {
    await prepareProjectState(project({}))

    expect(useTableRuntimeStore.getState().cacheInfo).toEqual({})
  })
})
