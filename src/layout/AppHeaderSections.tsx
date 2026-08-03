import { useProjectStore } from '@/state/projectStore'
import { useNavigation } from './navigation/NavigationContext'
import { ProjectSwitcher } from './project-controls/ProjectSwitcher'
import type { ChartNode, ProjectNode } from '@/types'

export function GridHeaderContent({ selectedNode }: { selectedNode: ProjectNode }) {
  return (
    <>
      <span className="min-w-0 max-w-36 truncate text-sm font-medium sm:max-w-56">{selectedNode.name}</span>
      <span className="hidden items-center gap-1 md:inline-flex">
        {selectedNode.kind === 'source_table' ? (
          <>
            <span className="badge badge-accent">Source</span>
            <span className="badge badge-green">Editable</span>
          </>
        ) : (
          <>
            <span className="badge badge-purple">Derived</span>
            <span className="badge badge-purple">View Only</span>
          </>
        )}
      </span>
      <div className="flex-1" />
    </>
  )
}

export function ChartHeaderContent({
  selectedNode,
}: {
  selectedNode: ProjectNode
}) {
  const { openTable } = useNavigation()
  const chartNode = selectedNode as ChartNode
  const sourceTableName = chartNode.plan.sourceTableId
    ? useProjectStore.getState().nodes[chartNode.plan.sourceTableId]?.name || 'Unknown'
    : null

  return (
    <>
      <span className="min-w-0 max-w-36 truncate text-sm font-medium sm:max-w-56">{selectedNode.name}</span>
      {chartNode.plan.sourceTableId && (
        <button
          onClick={() => openTable(chartNode.plan.sourceTableId)}
          className="ml-2 hidden max-w-48 truncate text-xs text-accent-green hover:underline xl:inline"
        >
          Source - {sourceTableName}
        </button>
      )}
      <div className="flex-1" />
    </>
  )
}

export function ProjectSwitcherHeader() {
  return (
    <>
      <div className="flex self-stretch items-center border-r border-border-subtle pr-2 sm:pr-3">
        <ProjectSwitcher mode="switch-only" />
      </div>
      <div className="flex-1" />
    </>
  )
}
