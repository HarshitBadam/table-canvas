import type { DerivedTableNode, ProjectNode } from '@/types'
import type { SuggestionEngineContext } from './engine/registry'

type ExistingDerivedTables = NonNullable<SuggestionEngineContext['existingDerivedTables']>

export function getExistingDerivedTables(
  nodes: Iterable<ProjectNode>,
  sourceTableId: string,
): ExistingDerivedTables {
  return Array.from(nodes)
    .filter(
      (node): node is DerivedTableNode =>
        node.kind === 'derived_table' &&
        node.plan.upstreamNodeIds.includes(sourceTableId),
    )
    .map((node) => ({
      id: node.id,
      name: node.name,
      transformType: node.plan.transformDef.type,
      groupByColumns: 'groupByColumns' in node.plan.transformDef
        ? node.plan.transformDef.groupByColumns
        : undefined,
    }))
}
