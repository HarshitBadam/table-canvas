import type { ProjectNode, Edge, Patches } from '@/types'
import { getDB } from './dbCore'
import { serializePatches, type SerializedPatches } from './patchSerialization'

export interface StoredProject {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, SerializedPatches>
  createdAt: string
  updatedAt: string
}

export async function saveProject(
  id: string,
  name: string,
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>
): Promise<void> {
  const db = await getDB()
  const existing = await db.get('projects', id)
  const now = new Date().toISOString()

  const project = {
    id,
    name,
    nodes,
    edges,
    patches: serializePatches(patches),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await db.put('projects', project as unknown as import('./dbCore').TableCanvasDB['projects']['value'])
}

export async function loadProject(id: string): Promise<StoredProject | null> {
  const db = await getDB()
  const project = await db.get('projects', id)
  if (!project) return null
  return project as unknown as StoredProject
}

export async function listProjects(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const db = await getDB()
  const projects = await db.getAllFromIndex('projects', 'by-updated')

  return projects.map(p => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
  })).reverse()
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('projects', id)
}
