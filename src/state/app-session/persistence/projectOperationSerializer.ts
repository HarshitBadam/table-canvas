let operationTail: Promise<void> = Promise.resolve()
let activeProjectGeneration = 0

/** Serializes project/runtime transitions without coupling their error handling. */
export function serializeProjectOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = operationTail.then(operation, operation)
  operationTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/**
 * Bumped whenever the user initiates a project switch (create/load/delete/
 * duplicate/import). Long-running background work that awaits network I/O
 * before committing state (e.g. reconnect sync) can capture this alongside the
 * active project id and, right before committing, detect that the user has
 * moved on in the meantime. A user switch always wins over a stale background
 * result.
 */
export function bumpActiveProjectGeneration(): number {
  activeProjectGeneration += 1
  return activeProjectGeneration
}

export function getActiveProjectGeneration(): number {
  return activeProjectGeneration
}
