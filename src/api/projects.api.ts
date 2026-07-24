import { api } from './client';
import type { ProjectNode, Edge } from '@/types';
import type { SerializedPatches } from '@/persistence/patchSerialization';
import type { Report } from '@/report/types';

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
  reports: Record<string, Report>;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateProjectData {
  name?: string;
  nodes?: Record<string, ProjectNode>;
  edges?: Record<string, Edge>;
  patches?: Record<string, SerializedPatches>;
  reports?: Record<string, Report>;
}

interface UpdateProjectData {
  name?: string;
  nodes?: Record<string, ProjectNode>;
  edges?: Record<string, Edge>;
  patches?: Record<string, SerializedPatches>;
  reports?: Record<string, Report>;
  expectedRevision: number;
}

export type ProjectPayload = {
  name: string;
  nodes: Record<string, ProjectNode>;
  edges: Record<string, Edge>;
  patches: Record<string, SerializedPatches>;
  reports: Record<string, Report>;
  expectedRevision: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const { projects } = await api.get<{ projects: ProjectSummary[] }>('/projects');
  return projects;
}

export async function getProject(projectId: string): Promise<Project> {
  const { project } = await api.get<{ project: Project }>(`/projects/${projectId}`);
  return project;
}

export async function createProject(
  data: CreateProjectData = {},
  operationId?: string,
): Promise<Project> {
  const { project } = await api.post<{ project: Project }>('/projects', data, {
    headers: operationId ? { 'Idempotency-Key': operationId } : undefined,
  });
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

