/**
 * Projects API functions
 */

import { api } from './client';
import type { ProjectNode, Edge, Patches } from '@/types';


export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface SerializedPatches {
  cellPatches: Record<string, Record<string, unknown>>;
  deletedRows: string[];
  insertedRows: Array<{ rowId: string; values: Record<string, unknown>; insertedAt: number }>;
  highlightedCells: string[];
}

export interface Project {
  id: string;
  name: string;
  nodes: Record<string, ProjectNode>;
  edges: Record<string, Edge>;
  patches: Record<string, SerializedPatches>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectData {
  name?: string;
  nodes?: Record<string, ProjectNode>;
  edges?: Record<string, Edge>;
  patches?: Record<string, SerializedPatches>;
}

export interface UpdateProjectData {
  name?: string;
  nodes?: Record<string, ProjectNode>;
  edges?: Record<string, Edge>;
  patches?: Record<string, SerializedPatches>;
}


export function serializePatches(
  patches: Record<string, Patches>
): Record<string, SerializedPatches> {
  const serialized: Record<string, SerializedPatches> = {};
  
  for (const [tableId, patch] of Object.entries(patches)) {
    serialized[tableId] = {
      cellPatches: patch.cellPatches,
      deletedRows: Array.from(patch.deletedRows),
      insertedRows: patch.insertedRows,
      highlightedCells: Array.from(patch.highlightedCells || []),
    };
  }
  
  return serialized;
}

export function deserializePatches(
  serialized: Record<string, SerializedPatches>
): Record<string, Patches> {
  const patches: Record<string, Patches> = {};
  
  for (const [tableId, patch] of Object.entries(serialized)) {
    patches[tableId] = {
      cellPatches: patch.cellPatches as Record<string, Record<string, import('@/types').CellValue>>,
      deletedRows: new Set(patch.deletedRows),
      insertedRows: patch.insertedRows as import('@/types').InsertedRow[],
      highlightedCells: new Set(patch.highlightedCells || []),
    };
  }
  
  return patches;
}


/**
 * List all projects for the current user
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  const { projects } = await api.get<{ projects: ProjectSummary[] }>('/projects');
  return projects;
}

/**
 * Get a project by ID
 */
export async function getProject(projectId: string): Promise<Project> {
  const { project } = await api.get<{ project: Project }>(`/projects/${projectId}`);
  return project;
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectData = {}): Promise<Project> {
  const { project } = await api.post<{ project: Project }>('/projects', data);
  return project;
}

/**
 * Update a project (full update)
 */
export async function updateProject(
  projectId: string,
  data: UpdateProjectData
): Promise<Project> {
  const { project } = await api.put<{ project: Project }>(
    `/projects/${projectId}`,
    data
  );
  return project;
}

/**
 * Partially update a project
 */
export async function patchProject(
  projectId: string,
  data: Partial<UpdateProjectData>
): Promise<Project> {
  const { project } = await api.patch<{ project: Project }>(
    `/projects/${projectId}`,
    data
  );
  return project;
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${projectId}`);
}

/**
 * Save project state (debounced save helper)
 */
export async function saveProjectState(
  projectId: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
  name?: string
): Promise<Project> {
  return updateProject(projectId, {
    name,
    nodes,
    edges,
    patches: serializePatches(patches),
  });
}
