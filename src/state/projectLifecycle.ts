import { getEngine } from '@/engine'
import { dropEngineTables } from '@/engine/engineTableCleanup'
import { invalidateMaterializations } from '@/engine/materializationCoordinator'
import { fetchProjects, loadProjectWithSync } from '@/persistence/syncService'
import type { ProjectNode } from '@/types'
import { useDataStore } from './dataStore'
import { clearAllTableOperations } from './tableOperationCoordinator'
import { useTableRuntimeStore } from './tableRuntimeStore'

export function hasProjectTables(nodes: Record<string, { kind: string }>): boolean {
  return Object.values(nodes).some(
    node => node.kind === 'source_table' || node.kind === 'derived_table',
  )
}

export async function clearProjectRuntime(nodes: Record<string, ProjectNode>): Promise<void> {
  const tableIds = Object.values(nodes)
    .filter((node) => node.kind === 'source_table' || node.kind === 'derived_table')
    .map((node) => node.id)
  clearAllTableOperations()
  await dropEngineTables(tableIds)
  invalidateMaterializations()
  useTableRuntimeStore.getState().resetRuntime()
  useDataStore.setState({ tableData: {} })
}

export async function initializeEngine(): Promise<void> {
  await getEngine().init()
}

function mostRecentlyUpdated(
  projects: Awaited<ReturnType<typeof fetchProjects>>,
): (typeof projects)[number] {
  return projects.reduce((latest, project) => (
    new Date(project.updatedAt).getTime() > new Date(latest.updatedAt).getTime()
      ? project
      : latest
  ))
}

export async function loadOrCreateProject(requestedProjectId?: string | null) {
  const projects = await fetchProjects()
  if (projects.length === 0) {
    return { project: null, projectList: projects }
  }

  const requested = requestedProjectId
    ? projects.find(project => project.id === requestedProjectId)
    : undefined
  const target = requested ?? mostRecentlyUpdated(projects)
  const project = await loadProjectWithSync(target.id)
  if (!project) {
    throw new Error(`Project "${target.name}" is unavailable`)
  }
  return { project, projectList: projects }
}
