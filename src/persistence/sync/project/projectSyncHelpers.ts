import { getProject } from '@/api/projects.api'
import { withoutRuntimeNodeState } from '@/state/document/transientProjectState'
import { deserializePatches } from '../../storage/local-db/patchSerialization'
import { scopedStorageKey } from '../../storage/storageScope'
import type { ProjectWithSync } from './projectSync'

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
