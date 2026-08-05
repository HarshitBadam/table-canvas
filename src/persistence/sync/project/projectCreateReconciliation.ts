import { createProject } from '@/api/projects.api'
import { ApiError } from '@/api/client'
import {
  isStorageScopeContextCurrent,
  type StorageScopeContext,
} from '../../storage/storageScope'

class AmbiguousProjectCreateError extends Error {
  constructor(
    message: string,
    public readonly operationId: string,
    public readonly cause: unknown,
  ) {
    super(message)
    this.name = 'AmbiguousProjectCreateError'
  }
}

/** 429 defers rather than fails: the queued operation survives for the next attempt. */
export function isRetryableRemoteDeferral(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.statusCode >= 500 || error.statusCode === 429
  }
  return error instanceof TypeError
}

/**
 * Per-intent (scope + name) queue of unresolved create attempts. Concurrent
 * intentional creates of the same name each claim their own fresh entry, so
 * they never share an operation id. A create that ends ambiguously (server
 * state unconfirmed) leaves its entry behind as 'ambiguous'; only a later
 * retry of that specific intent claims and reuses it, reconciling with the
 * same idempotency key instead of risking a duplicate server project.
 */
interface UnresolvedCreateEntry {
  operationId: string
  state: 'inflight' | 'ambiguous'
}

const unresolvedByIntent = new Map<string, UnresolvedCreateEntry[]>()
const CREATE_OPERATIONS_KEY = 'tablecanvas:unresolved-project-creates'

function readPersistedAmbiguous(): Record<string, string[]> {
  try {
    const value = localStorage.getItem(CREATE_OPERATIONS_KEY)
    return value ? JSON.parse(value) as Record<string, string[]> : {}
  } catch {
    return {}
  }
}

function persistAmbiguous(): void {
  const persisted: Record<string, string[]> = {}
  for (const [intentKey, entries] of unresolvedByIntent) {
    const ambiguous = entries
      .filter(entry => entry.state === 'ambiguous')
      .map(entry => entry.operationId)
    if (ambiguous.length) persisted[intentKey] = ambiguous
  }
  try {
    localStorage.setItem(CREATE_OPERATIONS_KEY, JSON.stringify(persisted))
  } catch {
    // In-memory reconciliation still protects retries in this page session.
  }
}

function entriesFor(intentKey: string): UnresolvedCreateEntry[] {
  let entries = unresolvedByIntent.get(intentKey)
  if (!entries) {
    const persisted = readPersistedAmbiguous()[intentKey] ?? []
    entries = persisted.map(operationId => ({ operationId, state: 'ambiguous' as const }))
    unresolvedByIntent.set(intentKey, entries)
  }
  return entries
}

/**
 * A prior ambiguous attempt for this exact intent is a retry: reuse its operation
 * id. Otherwise this is a new, concurrent intent and gets a fresh one so it can
 * never collapse into another in-flight create of the same name.
 */
function operationFor(intentKey: string): string {
  const entries = entriesFor(intentKey)
  const retry = entries.find(entry => entry.state === 'ambiguous')
  if (retry) {
    retry.state = 'inflight'
    persistAmbiguous()
    return retry.operationId
  }
  const operationId = createOperationId()
  entries.push({ operationId, state: 'inflight' })
  return operationId
}

function markAmbiguous(intentKey: string, operationId: string): void {
  const entry = entriesFor(intentKey).find(candidate => candidate.operationId === operationId)
  if (entry) entry.state = 'ambiguous'
  persistAmbiguous()
}

function resolveOperation(intentKey: string, operationId: string): void {
  const entries = unresolvedByIntent.get(intentKey)
  if (!entries) return
  const remaining = entries.filter(entry => entry.operationId !== operationId)
  if (remaining.length) unresolvedByIntent.set(intentKey, remaining)
  else unresolvedByIntent.delete(intentKey)
  persistAmbiguous()
}

function createOperationId(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `project_${suffix}`
}

export async function createRemoteProject(
  data: Parameters<typeof createProject>[0],
  intentKey: string,
  context: StorageScopeContext,
) {
  const operationId = operationFor(intentKey)
  try {
    const created = await createProject(data, operationId)
    resolveOperation(intentKey, operationId)
    return created
  } catch (firstError) {
    if (!isStorageScopeContextCurrent(context)) {
      resolveOperation(intentKey, operationId)
      throw new Error('The account changed while the project was being created.')
    }
    if (!isRetryableRemoteDeferral(firstError)) {
      resolveOperation(intentKey, operationId)
      throw firstError
    }
    try {
      const reconciled = await createProject(data, operationId)
      resolveOperation(intentKey, operationId)
      return reconciled
    } catch (retryError) {
      if (!isRetryableRemoteDeferral(retryError)) {
        resolveOperation(intentKey, operationId)
        throw retryError
      }
      markAmbiguous(intentKey, operationId)
      throw new AmbiguousProjectCreateError(
        'The server may have created the project, but confirmation failed. Retry to reconcile the same operation.',
        operationId,
        retryError,
      )
    }
  }
}
