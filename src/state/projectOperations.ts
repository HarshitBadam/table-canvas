import { ApiError } from '@/api/client'
import { generateId } from '@/lib/utils'
import type { Report } from '@/report/types'
import type { Edge, Patches, ProjectNode } from '@/types'

export type ProjectActionErrorCode =
  | 'auth'
  | 'busy'
  | 'last-project'
  | 'limit'
  | 'network'
  | 'not-found'
  | 'persistence'
  | 'validation'

export class ProjectActionError extends Error {
  readonly cause?: unknown

  constructor(
    public readonly code: ProjectActionErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message)
    this.name = 'ProjectActionError'
    if (cause !== undefined) this.cause = cause
  }
}

export function toProjectActionError(error: unknown, fallback: string): ProjectActionError {
  if (error instanceof ProjectActionError) return error
  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return new ProjectActionError('auth', error.message, error)
    }
    if (error.statusCode === 403) {
      return new ProjectActionError('limit', error.message, error)
    }
    if (error.statusCode === 400 || error.statusCode === 422) {
      return new ProjectActionError(
        'validation',
        error.errors?.join(', ') || error.message,
        error,
      )
    }
    if (error.statusCode === 404) {
      return new ProjectActionError('not-found', error.message, error)
    }
  }
  if (error instanceof TypeError) {
    return new ProjectActionError('network', 'Network unavailable. Try again.', error)
  }
  return new ProjectActionError(
    'persistence',
    error instanceof Error ? error.message : fallback,
    error,
  )
}

export function nextDuplicateName(name: string, existingNames: string[]): string {
  const used = new Set(existingNames.map(value => value.trim().toLocaleLowerCase()))
  const base = `${name.trim() || 'Untitled Project'} copy`
  if (!used.has(base.toLocaleLowerCase())) return base
  let suffix = 2
  while (used.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1
  return `${base} ${suffix}`
}

function remapReferences<T>(
  value: T,
  ids: ReadonlyMap<string, string>,
  property = '',
): T {
  if (typeof value === 'string') {
    const isReference = property === 'id' || property.endsWith('Id') || property.endsWith('Ids')
    return (isReference ? ids.get(value) ?? value : value) as T
  }
  if (Array.isArray(value)) {
    return value.map(item => remapReferences(item, ids, property)) as T
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, remapReferences(item, ids, key)]),
  ) as T
}

export function cloneProjectContents(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
  patches: Record<string, Patches>,
  reports: Record<string, Report>,
  projectId: string,
) {
  const nodeIds = new Map(Object.keys(nodes).map(id => [id, generateId()]))
  const edgeIds = new Map(Object.keys(edges).map(id => [id, generateId()]))
  const graphIds = new Map([...nodeIds, ...edgeIds])
  const clonedNodes = Object.fromEntries(Object.entries(nodes).map(([id, node]) => [
    nodeIds.get(id) ?? id,
    remapReferences(structuredClone(node), graphIds),
  ]))
  const clonedEdges = Object.fromEntries(Object.entries(edges).map(([id, edge]) => [
    edgeIds.get(id) ?? id,
    remapReferences(structuredClone(edge), graphIds),
  ]))
  const clonedPatches = Object.fromEntries(Object.entries(patches).map(([id, patch]) => [
    nodeIds.get(id) ?? id,
    structuredClone(patch),
  ]))
  const now = new Date().toISOString()
  const clonedReports = Object.fromEntries(Object.values(reports).map((report) => {
    const id = generateId()
    return [id, {
      ...remapReferences(structuredClone(report), graphIds),
      id,
      projectId,
      createdAt: now,
      updatedAt: now,
    }]
  }))
  return {
    nodes: clonedNodes,
    edges: clonedEdges,
    patches: clonedPatches,
    reports: clonedReports,
  }
}
