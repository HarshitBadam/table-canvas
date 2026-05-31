import { api } from './client';
import type { ProjectNode, Edge, Patches } from '@/types';
import type { SerializedPatches } from '@/persistence/db';

export type { SerializedPatches };

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: Date;
  createdAt: Date;
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

interface CreateProjectData {
  name?: string;
  nodes?: Record<string, ProjectNode>;
  edges?: Record<string, Edge>;
  patches?: Record<string, SerializedPatches>;
}

interface UpdateProjectData {
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


export async function listProjects(): Promise<ProjectSummary[]> {
  const { projects } = await api.get<{ projects: ProjectSummary[] }>('/projects');
  return projects;
}

export async function getProject(projectId: string): Promise<Project> {
  const { project } = await api.get<{ project: Project }>(`/projects/${projectId}`);
  return project;
}

export async function createProject(data: CreateProjectData = {}): Promise<Project> {
  const { project } = await api.post<{ project: Project }>('/projects', data);
  return project;
}

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

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${projectId}`);
}

