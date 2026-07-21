import type { ProjectWithSync } from '@/persistence/projectSync'
import { loadReportsForProject } from '@/persistence/reportStorage'
import { useReportStore } from '@/report/reportStore'
import { useDataStore } from './dataStore'
import { useProjectStore } from './projectStore'
import { withoutTransientComputeState } from './transientProjectState'
import {
  clearProjectRuntime,
  hasProjectTables,
  materializeProjectTables,
} from './projectLifecycle'
import { ProjectActionError } from './projectOperations'

export async function prepareProjectState(project: ProjectWithSync): Promise<void> {
  const nodes = withoutTransientComputeState(project.nodes)
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
    const selectedReportId = Object.values(reports)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null
    useReportStore.setState({
      reports,
      selectedReportId,
      activeProjectId: project.id,
      persistenceStatus: 'idle',
      persistenceError: null,
    })
    if (hasProjectTables(nodes)) {
      const result = await materializeProjectTables(nodes)
      if (result.failures.length > 0) {
        throw new Error(
          `Could not prepare ${result.failures.length} project table${
            result.failures.length === 1 ? '' : 's'
          }: ${result.failures[0].error}`,
        )
      }
    }
  } catch (error) {
    try {
      await clearProjectRuntime(nodes)
      useProjectStore.setState(projectSnapshot)
      useReportStore.setState(reportSnapshot)
      if (hasProjectTables(projectSnapshot.nodes)) {
        await materializeProjectTables(projectSnapshot.nodes)
      }
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
