let generation = 0
let engineMutationQueue = Promise.resolve()

export interface MaterializationScope {
  projectId: string
  generation: number
}

export function captureMaterializationScope(projectId: string): MaterializationScope {
  return { projectId, generation }
}

export function isMaterializationScopeCurrent(
  scope: MaterializationScope,
  currentProjectId: string,
): boolean {
  return scope.projectId === currentProjectId && scope.generation === generation
}

export function invalidateMaterializations(): void {
  generation += 1
}

export function enqueueEngineMutation<T>(operation: () => Promise<T>): Promise<T> {
  const queued = engineMutationQueue.then(operation, operation)
  engineMutationQueue = queued.then(() => undefined, () => undefined)
  return queued
}
