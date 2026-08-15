import { getProject } from '@/api/projects.api'
import { withoutRuntimeNodeState } from '@/state/document/transientProjectState'
import type { Edge, Patches, ProjectNode } from '@/types'
import type { Report } from '@/report/types'
import { deserializePatches } from '../../storage/local-db/patchSerialization'
import { scopedStorageKey } from '../../storage/storageScope'

/**
 * Declared here (a leaf module with no dependents of its own) rather than in the
 * facade so both `projectSync.ts` and `projectLoadSync.ts` can depend on this type
 * without creating an import cycle between them.
 */
export interface ProjectWithSync {
  id: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  isLocalOnly?: boolean
  needsSync?: boolean
  revision?: number
  reports?: Record<string, Report>
}

export function fromRemote(
  project: Awaited<ReturnType<typeof getProject>>,
): ProjectWithSync {
  return {
    id: project.id,
    name: project.name,
    nodes: withoutRuntimeNodeState(project.nodes),
    edges: project.edges,
    patches: deserializePatches(project.patches),
    isLocalOnly: false,
    needsSync: false,
    revision: project.revision ?? 0,
    reports: project.reports ?? {},
  }
}

export function createLocalProjectId(): string {
  return `local_${createSuffix()}`
}

/**
 * Identifies a create *intent* (this scope + this name), not a single operation.
 * Concurrent intentional creates of the same name share this key so the
 * reconciliation queue can tell them apart from a later retry of a failed one.
 */
export function createProjectIntentKey(scope: string, name: string): string {
  return `create:${scopedStorageKey(scope, name)}`
}

export function toTimestamp(value: Date | string | undefined): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function createSuffix(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
}
