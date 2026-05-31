import { Types } from 'mongoose';
import { Project, IProjectDocument } from '../models/Project.js';
import { File, IFileDocument } from '../models/File.js';
import type { ProjectNode, Edge, SerializedPatches } from '../types/index.js';


export function createMockUserId(): Types.ObjectId {
  return new Types.ObjectId();
}

export function createMockAuthContext(userId?: Types.ObjectId) {
  const id = userId || createMockUserId();
  return {
    user: {
      userId: id.toString(),
      email: `test-${id.toString().slice(-6)}@example.com`,
    },
  };
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
      collapsed: false,
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


export interface CreateTestFileOptions {
  userId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  filename?: string;
  originalName?: string;
  contentType?: string;
  size?: number;
  deleted?: boolean;
}

export async function createTestFile(
  options: CreateTestFileOptions = {}
): Promise<IFileDocument> {
  const {
    userId = createMockUserId(),
    projectId,
    filename = 'test-file.csv',
    originalName = 'test-file.csv',
    contentType = 'text/csv',
    size = 1024,
    deleted = false,
  } = options;

  const file = new File({
    gridFsId: new Types.ObjectId(),
    userId,
    projectId,
    filename,
    originalName,
    contentType,
    size,
    deletedAt: deleted ? new Date() : null,
  });

  await file.save();
  return file;
}

export async function createTestFiles(
  userId: Types.ObjectId,
  count: number,
  projectId?: Types.ObjectId
): Promise<IFileDocument[]> {
  const files: IFileDocument[] = [];

  for (let i = 0; i < count; i++) {
    const file = await createTestFile({
      userId,
      projectId,
      filename: `test-file-${i + 1}.csv`,
      originalName: `test-file-${i + 1}.csv`,
    });
    files.push(file);
  }

  return files;
}


export async function clearCollection(collectionName: string): Promise<void> {
  const mongoose = await import('mongoose');
  const collection = mongoose.connection.collections[collectionName];
  if (collection) {
    await collection.deleteMany({});
  }
}

export async function clearDatabase(): Promise<void> {
  const mongoose = await import('mongoose');
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

export async function getCollectionCount(
  collectionName: string
): Promise<number> {
  const mongoose = await import('mongoose');
  const collection = mongoose.connection.collections[collectionName];
  if (collection) {
    return collection.countDocuments();
  }
  return 0;
}


export function assertProjectStructure(project: Record<string, unknown>): void {
  if (!project.id) throw new Error('Project missing id');
  if (!project.name) throw new Error('Project missing name');
  if (typeof project.nodes !== 'object') throw new Error('Project missing nodes');
  if (typeof project.edges !== 'object') throw new Error('Project missing edges');
  if (typeof project.patches !== 'object') throw new Error('Project missing patches');
  if (!project.createdAt) throw new Error('Project missing createdAt');
  if (!project.updatedAt) throw new Error('Project missing updatedAt');
}

export function assertFileStructure(file: Record<string, unknown>): void {
  if (!file.id) throw new Error('File missing id');
  if (!file.filename) throw new Error('File missing filename');
  if (!file.contentType) throw new Error('File missing contentType');
  if (typeof file.size !== 'number') throw new Error('File missing size');
  if (!file.createdAt) throw new Error('File missing createdAt');
}


export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPastDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}
