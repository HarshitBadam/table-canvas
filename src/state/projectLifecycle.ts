import { getEngine } from '@/engine'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { createProjectWithSync, fetchProjects, loadProjectWithSync } from '@/persistence/syncService'
import type { ProjectNode } from '@/types'
import { useProjectStore } from './projectStore'
import { useDataStore } from './dataStore'

export async function clearProjectRuntime(nodes: Record<string, ProjectNode>): Promise<void> {
  useDataStore.setState({ tableData: {} })
  const tableIds = Object.values(nodes)
    .filter((node) => node.kind === 'source_table' || node.kind === 'derived_table')
    .map((node) => node.id)
  await Promise.allSettled(tableIds.map((tableId) => getEngine().dropTable(tableId)))
}

export async function materializeProjectTables(nodes: Record<string, ProjectNode>): Promise<void> {
  const entries = Object.entries(nodes)
  const tableIds = [
    ...entries.filter(([, node]) => node.kind === 'source_table').map(([id]) => id),
    ...entries.filter(([, node]) => node.kind === 'derived_table').map(([id]) => id),
  ]
  for (const tableId of tableIds) {
    try {
      await ensureTableMaterialized(tableId)
    } catch (error) {
      console.error('[AppContext] Failed to materialize table:', error)
    }
  }
}

export async function initializeEngine(): Promise<void> {
  await getEngine().init()
}

export async function loadOrCreateProject() {
  const projects = await fetchProjects()
  const project = projects.length > 0
    ? await loadProjectWithSync(projects[0].id)
    : await createProjectWithSync('Untitled Project')
  const resolvedProject = project ?? await createProjectWithSync('Untitled Project')
  await clearProjectRuntime(useProjectStore.getState().nodes)
  useProjectStore.setState({
    projectId: resolvedProject.id,
    projectName: resolvedProject.name,
    nodes: resolvedProject.nodes,
    edges: resolvedProject.edges,
    patches: resolvedProject.patches,
  })
  return { project: resolvedProject, projectList: projects }
}
