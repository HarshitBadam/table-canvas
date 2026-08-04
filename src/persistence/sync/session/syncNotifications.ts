/** Reported after a cross-device conflict was resolved without a conflict copy. */
export interface ProjectMergeEvent {
  projectId: string
  recoveredReportIds: string[]
  droppedEdgeIds: string[]
}

let projectSyncErrorHandler: ((message: string | null) => void) | null = null
let projectMergeHandler: ((event: ProjectMergeEvent) => void) | null = null

export function setProjectSyncErrorHandler(
  handler: ((message: string | null) => void) | null,
): void {
  projectSyncErrorHandler = handler
}

export function reportProjectSyncError(message: string | null): void {
  projectSyncErrorHandler?.(message)
}

export function setProjectMergeHandler(
  handler: ((event: ProjectMergeEvent) => void) | null,
): void {
  projectMergeHandler = handler
}

export function notifyProjectMerge(event: ProjectMergeEvent): void {
  projectMergeHandler?.(event)
}
