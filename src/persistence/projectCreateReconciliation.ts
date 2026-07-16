import { createProject } from '@/api/projects.api'
import { ApiError } from '@/api/client'

export class AmbiguousProjectCreateError extends Error {
  constructor(
    message: string,
    public readonly operationId: string,
    public readonly cause: unknown,
  ) {
    super(message)
    this.name = 'AmbiguousProjectCreateError'
  }
}

export class ProjectCleanupError extends Error {
  constructor(message: string, public readonly cause: unknown) {
    super(message)
    this.name = 'ProjectCleanupError'
  }
}

export function isRetryableRemoteDeferral(error: unknown): boolean {
  if (error instanceof ApiError) return error.statusCode >= 500
  return error instanceof TypeError
}

const unresolvedCreateOperations = new Map<string, string>()
const CREATE_OPERATIONS_KEY = 'tablecanvas:unresolved-project-creates'

function readPersistedOperations(): Record<string, string> {
  try {
    const value = sessionStorage.getItem(CREATE_OPERATIONS_KEY)
    return value ? JSON.parse(value) as Record<string, string> : {}
  } catch {
    return {}
  }
}

function persistOperations(): void {
  try {
    sessionStorage.setItem(
      CREATE_OPERATIONS_KEY,
      JSON.stringify({
        ...readPersistedOperations(),
        ...Object.fromEntries(unresolvedCreateOperations),
      }),
    )
  } catch {
    // In-memory reconciliation still protects retries in this page session.
  }
}

function operationFor(recoveryKey: string): string {
  const persisted = readPersistedOperations()[recoveryKey]
  const operationId = unresolvedCreateOperations.get(recoveryKey)
    ?? persisted
    ?? createOperationId()
  unresolvedCreateOperations.set(recoveryKey, operationId)
  persistOperations()
  return operationId
}

function resolveOperation(recoveryKey: string): void {
  unresolvedCreateOperations.delete(recoveryKey)
  const persisted = readPersistedOperations()
  delete persisted[recoveryKey]
  for (const [key, value] of unresolvedCreateOperations) persisted[key] = value
  try {
    sessionStorage.setItem(CREATE_OPERATIONS_KEY, JSON.stringify(persisted))
  } catch {
    // The in-memory entry was still cleared.
  }
}

function createOperationId(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `project_${suffix}`
}

export async function createRemoteProject(
  data: Parameters<typeof createProject>[0],
  recoveryKey: string,
) {
  const operationId = operationFor(recoveryKey)
  try {
    const created = await createProject(data, operationId)
    resolveOperation(recoveryKey)
    return created
  } catch (firstError) {
    if (!isRetryableRemoteDeferral(firstError)) {
      resolveOperation(recoveryKey)
      throw firstError
    }
    try {
      const reconciled = await createProject(data, operationId)
      resolveOperation(recoveryKey)
      return reconciled
    } catch (retryError) {
      if (!isRetryableRemoteDeferral(retryError)) {
        resolveOperation(recoveryKey)
        throw retryError
      }
      throw new AmbiguousProjectCreateError(
        'The server may have created the project, but confirmation failed. Retry to reconcile the same operation.',
        operationId,
        retryError,
      )
    }
  }
}
