import type { ProjectNode, TableNode } from '@/types'
import { getDependentNodeIds } from '@/engine/graph/workflowGraph'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import type { ProjectStoreState } from '../types'

function isTableNode(node: ProjectNode | undefined): node is TableNode {
  return node?.kind === 'source_table' || node?.kind === 'derived_table'
}

export function isTableRename(
  node: ProjectNode | undefined,
  updates: Partial<ProjectNode>,
): boolean {
  return Boolean(
    isTableNode(node)
    && updates.name
    && updates.name !== node.name,
  )
}

export function applyNodeUpdate(
  state: ProjectStoreState,
  id: string,
  updates: Partial<ProjectNode>,
): void {
  const node = state.nodes[id]
  if (!node) return
  const renamingTable = isTableRename(node, updates)
  const now = new Date().toISOString()
  Object.assign(node, updates, { updatedAt: now })
  if (!renamingTable || !updates.name) return

  // Join plans store display names alongside ids; keep them aligned for the editor.
  for (const candidate of Object.values(state.nodes)) {
    if (candidate.kind !== 'derived_table') continue
    const transform = candidate.plan.transformDef
    if (transform.type !== 'join') continue
    let changed = false
    if (transform.leftTableId === id && transform.leftTableName !== updates.name) {
      transform.leftTableName = updates.name
      changed = true
    }
    if (transform.rightTableId === id && transform.rightTableName !== updates.name) {
      transform.rightTableName = updates.name
      changed = true
    }
    if (changed) candidate.updatedAt = now
  }
}

export function markRenameDependentsDirty(
  state: ProjectStoreState,
  id: string,
): void {
  const affected = [...getDependentNodeIds(state.nodes, state.edges, id)]
    .filter((nodeId) => isTableNode(state.nodes[nodeId]))
  useTableRuntimeStore.getState().markNodesDirty(affected)
}
