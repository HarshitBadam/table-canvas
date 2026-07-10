import { useProjectStore } from '@/state/projectStore'
import type { DerivedTableNode, SourceTableNode, TableSchema } from '@/types'

const sampleSchema: TableSchema = {
  columns: [
    { id: 'col1', name: 'ID', type: 'string', nullable: false },
    { id: 'col2', name: 'Value', type: 'number', nullable: true },
  ],
  rowCount: 100,
}

export function resetStore(): void {
  useProjectStore.setState({
    projectId: 'test-project',
    projectName: 'Test Project',
    nodes: {},
    edges: {},
    patches: {},
    selectedNodeId: null,
    history: { past: [], future: [] },
  })
}

export function addSource(name: string): string {
  return useProjectStore.getState().addSourceTable({
    name,
    fileRef: `file_${name}`,
    fileName: `${name}.csv`,
    fileType: 'csv',
    schema: sampleSchema,
  })
}

export function addFilter(sourceTableId: string, name: string): string {
  return useProjectStore.getState().addDerivedTable({
    name,
    transformDef: { type: 'filter', sourceTableId, conditions: [], logic: 'and' },
    upstreamNodeIds: [sourceTableId],
  })
}

export function addJoin(leftTableId: string, rightTableId: string, name: string): string {
  return useProjectStore.getState().addDerivedTable({
    name,
    transformDef: {
      type: 'join',
      leftTableId,
      rightTableId,
      joinType: 'inner',
      leftKey: 'col1',
      rightKey: 'col1',
    },
    upstreamNodeIds: [leftTableId, rightTableId],
  })
}

export function clean(...tableIds: string[]): void {
  const store = useProjectStore.getState()
  for (const tableId of tableIds) store.updateCacheInfo(tableId, { isDirty: false })
}

export function derived(tableId: string): DerivedTableNode {
  return useProjectStore.getState().nodes[tableId] as DerivedTableNode
}

export function source(tableId: string): SourceTableNode {
  return useProjectStore.getState().nodes[tableId] as SourceTableNode
}
