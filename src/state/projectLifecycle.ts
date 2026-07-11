import { getEngine } from '@/engine'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { createProjectWithSync, fetchProjects, loadProjectWithSync } from '@/persistence/syncService'
import type { ProjectNode } from '@/types'
import { useDataStore } from './dataStore'

export async function clearProjectRuntime(nodes: Record<string, ProjectNode>): Promise<void> {
  useDataStore.setState({ tableData: {} })
  const tableIds = Object.values(nodes)
    .filter((node) => node.kind === 'source_table' || node.kind === 'derived_table')
    .map((node) => node.id)
  await Promise.allSettled(tableIds.map((tableId) => getEngine().dropTable(tableId)))
}

export interface ProjectMaterializationSummary {
  completedTableIds: string[]
  failures: Array<{ tableId: string; error: string }>
}

export async function materializeProjectTables(
  nodes: Record<string, ProjectNode>,
): Promise<ProjectMaterializationSummary> {
  const entries = Object.entries(nodes)
  const tableIds = [
    ...entries.filter(([, node]) => node.kind === 'source_table').map(([id]) => id),
    ...entries.filter(([, node]) => node.kind === 'derived_table').map(([id]) => id),
  ]
  const summary: ProjectMaterializationSummary = {
    completedTableIds: [],
    failures: [],
  }
  for (const tableId of tableIds) {
    try {
      const result = await ensureTableMaterialized(tableId)
      if (result.status === 'error') {
        const error = result.error || 'Unknown materialization error'
        summary.failures.push({ tableId, error })
        console.error(`[AppContext] Failed to materialize table ${tableId}: ${error}`)
      } else {
        summary.completedTableIds.push(tableId)
      }
    } catch (error) {
      summary.failures.push({
        tableId,
        error: error instanceof Error ? error.message : 'Unknown materialization error',
      })
      console.error('[AppContext] Failed to materialize table:', error)
    }
  }
  return summary
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
  return { project: resolvedProject, projectList: projects }
}
