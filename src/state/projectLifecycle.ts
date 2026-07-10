import { getEngine } from '@/engine'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { createProjectWithSync, fetchProjects, loadProjectWithSync } from '@/persistence/syncService'
import type { ProjectNode } from '@/types'
import { useProjectStore } from './projectStore'

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
  useProjectStore.setState({
    projectId: resolvedProject.id,
    projectName: resolvedProject.name,
    nodes: resolvedProject.nodes,
    edges: resolvedProject.edges,
    patches: resolvedProject.patches,
  })
  return { project: resolvedProject, projectList: projects }
}
