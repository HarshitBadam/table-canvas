import { Types } from 'mongoose';
import { Project, IProjectDocument } from '../../src/models/Project.js';
import type { ProjectNode, Edge, SerializedPatches } from '../../src/types/index.js';


export function createMockUserId(): Types.ObjectId {
  return new Types.ObjectId();
}

export interface CreateTestProjectOptions {
  userId?: Types.ObjectId;
  name?: string;
  nodes?: Record<string, ProjectNode>;
  edges?: Record<string, Edge>;
  patches?: Record<string, SerializedPatches>;
  deleted?: boolean;
}

export async function createTestProject(
  options: CreateTestProjectOptions = {}
): Promise<IProjectDocument> {
  const {
    userId = createMockUserId(),
    name = 'Test Project',
    nodes = {},
    edges = {},
    patches = {},
    deleted = false,
  } = options;

  const project = new Project({
    userId,
    name,
    nodes,
    edges,
    patches,
    deletedAt: deleted ? new Date() : null,
  });

  await project.save();
  return project;
}

export async function createTestProjects(
  userId: Types.ObjectId,
  count: number
): Promise<IProjectDocument[]> {
  const projects: IProjectDocument[] = [];

  for (let i = 0; i < count; i++) {
    const project = await createTestProject({
      userId,
      name: `Test Project ${i + 1}`,
    });
    projects.push(project);
  }

  return projects;
}

export function createSampleNode(
  id: string,
  kind: 'source_table' | 'derived_table' | 'chart' = 'source_table'
): ProjectNode {
  return {
    id,
    kind,
    name: `Node ${id}`,
    ui: {
      position: { x: 100, y: 100 },
    },
    plan: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createSampleEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string
): Edge {
  return {
    id,
    fromNodeId,
    toNodeId,
    transformType: 'select',
  };
}
