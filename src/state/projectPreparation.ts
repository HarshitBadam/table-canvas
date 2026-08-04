import type { ProjectWithSync } from '@/persistence/projectSync'
import { loadReportsForProject } from '@/persistence/reportStorage'
import { useReportStore } from '@/report/reportStore'
import { useDataStore } from './dataStore'
import { useProjectStore } from './projectStore'
import { useTableRuntimeStore } from './tableRuntimeStore'
import { withoutRuntimeNodeState } from './transientProjectState'
import {
  clearProjectRuntime,
} from './projectLifecycle'
import { ProjectActionError } from './projectOperations'
import { retainHistoryFileRefs } from '@/persistence/historyFileCleanup'
import { getStorageScope } from '@/persistence/storageScope'

export async function prepareProjectState(project: ProjectWithSync): Promise<void> {
  const nodes = withoutRuntimeNodeState(project.nodes)
  const reports = await loadReportsForProject(project.id)
  const previousProject = useProjectStore.getState()
  const previousReports = useReportStore.getState()
  const previousData = useDataStore.getState().tableData
  const projectSnapshot = {
    projectId: previousProject.projectId,
    projectName: previousProject.projectName,
    nodes: structuredClone(previousProject.nodes),
    edges: structuredClone(previousProject.edges),
    patches: structuredClone(previousProject.patches),
    selectedNodeId: previousProject.selectedNodeId,
    history: structuredClone(previousProject.history),
  }
  const reportSnapshot = {
    reports: structuredClone(previousReports.reports),
    selectedReportId: previousReports.selectedReportId,
    activeProjectId: previousReports.activeProjectId,
    persistenceStatus: previousReports.persistenceStatus,
    persistenceError: previousReports.persistenceError,
  }
  try {
    await clearProjectRuntime(previousProject.nodes)
    useProjectStore.setState({
      projectId: project.id,
      projectName: project.name,
      nodes,
      edges: project.edges,
      patches: project.patches,
      selectedNodeId: null,
      history: { past: [], future: [] },
    })
    // Runtime was cleared; mark dirty so UI cannot look ready from persisted schema alone.
    const tableIds = Object.values(nodes)
      .filter(node => node.kind === 'source_table' || node.kind === 'derived_table')
      .map(node => node.id)
    useTableRuntimeStore.getState().markNodesDirty(tableIds)
    retainHistoryFileRefs(getStorageScope(), [])
    const selectedReportId = Object.values(reports)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null
    useReportStore.setState({
      reports,
      selectedReportId,
      activeProjectId: project.id,
      persistenceStatus: 'idle',
      persistenceError: null,
    })
  } catch (error) {
    try {
      await clearProjectRuntime(nodes)
      useProjectStore.setState(projectSnapshot)
      useReportStore.setState(reportSnapshot)
      useDataStore.setState({ tableData: previousData })
    } catch (restoreError) {
      throw new ProjectActionError(
        'persistence',
        'Project preparation failed and the previous project could not be fully restored.',
        { failure: error, restorationFailure: restoreError },
      )
    }
    throw error
  }
}
