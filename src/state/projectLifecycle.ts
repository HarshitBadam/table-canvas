import { getEngine } from '@/engine'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { createProjectWithSync, fetchProjects, loadProjectWithSync } from '@/persistence/syncService'
import type { ProjectNode } from '@/types'
import { useDataStore } from './dataStore'

export function hasProjectTables(nodes: Record<string, { kind: string }>): boolean {
  return Object.values(nodes).some(
    node => node.kind === 'source_table' || node.kind === 'derived_table',
  )
}

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
  if (projects.length === 0) {
    const project = await createProjectWithSync('Untitled Project')
    const now = new Date()
    return {
      project,
      projectList: [{
        id: project.id,
        name: project.name,
        createdAt: now,
        updatedAt: now,
      }],
    }
  }

  const project = await loadProjectWithSync(projects[0].id)
  if (!project) {
    throw new Error(`Project "${projects[0].name}" is unavailable`)
  }
  return { project, projectList: projects }
}
