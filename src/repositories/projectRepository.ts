/**
 * Project Repository
 * 
 * Abstracts project persistence operations across local (IndexedDB) and remote (backend).
 * Provides a unified interface for project CRUD operations.
 */

import type { ProjectNode, Edge, Patches } from '@/types'
import {
  fetchProjects,
  loadProjectWithSync,
  createProjectWithSync,
  saveProjectWithSync,
  deleteProjectWithSync,
  getSyncStatus,
  isNetworkOnline,
  type SyncStatus,
} from '@/persistence/syncService'
import {
  saveProject as saveProjectLocal,
  loadProject as loadProjectLocal,
  listProjects as listProjectsLocal,
  deleteProject as deleteProjectLocal,
  exportProjectFile,
  importProjectFile,
  type StoredProject,
} from '@/persistence/db'
// Note: ProjectSummary type is used in syncService

// ============================================================================
// Types
// ============================================================================

export interface ProjectData {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  isLocalOnly?: boolean
  needsSync?: boolean
}

export interface ProjectListItem {
  id: string
  name: string
  updatedAt: Date
  createdAt?: Date
}

// ============================================================================
// Project Repository
// ============================================================================

export const projectRepository = {
  /**
   * List all projects (from backend if online, local otherwise)
   */
  async list(): Promise<ProjectListItem[]> {
    const projects = await fetchProjects()
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt : new Date(p.updatedAt),
      createdAt: p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt),
    }))
  },

  /**
   * Load a project by ID
   */
  async load(projectId: string): Promise<ProjectData | null> {
    return loadProjectWithSync(projectId)
  },

  /**
   * Create a new project
   */
  async create(name?: string): Promise<ProjectData> {
    return createProjectWithSync(name)
  },

  /**
   * Save project data
   */
  async save(
    projectId: string,
    name: string,
    nodes: Record<string, ProjectNode>,
    edges: Record<string, Edge>,
    patches: Record<string, Patches>
  ): Promise<void> {
    return saveProjectWithSync(projectId, name, nodes, edges, patches)
  },

  /**
   * Delete a project
   */
  async delete(projectId: string): Promise<void> {
    return deleteProjectWithSync(projectId)
  },

  /**
   * Export project as downloadable JSON file
   */
  async export(projectId: string): Promise<Blob> {
    return exportProjectFile(projectId)
  },

  /**
   * Import project from JSON file
   */
  async import(file: File): Promise<string> {
    return importProjectFile(file)
  },

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return getSyncStatus()
  },

  /**
   * Check if network is online
   */
  isOnline(): boolean {
    return isNetworkOnline()
  },

  // ========================================================================
  // Local-only operations (for offline support)
  // ========================================================================

  /**
   * Save project to local storage only
   */
  async saveLocal(
    projectId: string,
    name: string,
    nodes: Record<string, ProjectNode>,
    edges: Record<string, Edge>,
    patches: Record<string, Patches>
  ): Promise<void> {
    return saveProjectLocal(projectId, name, nodes, edges, patches)
  },

  /**
   * Load project from local storage only
   */
  async loadLocal(projectId: string): Promise<StoredProject | null> {
    return loadProjectLocal(projectId)
  },

  /**
   * List projects from local storage only
   */
  async listLocal(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
    return listProjectsLocal()
  },

  /**
   * Delete project from local storage only
   */
  async deleteLocal(projectId: string): Promise<void> {
    return deleteProjectLocal(projectId)
  },
}

// ============================================================================
// Export singleton
// ============================================================================

export default projectRepository
