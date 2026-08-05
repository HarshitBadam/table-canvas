import {
  useCallback, useEffect, useRef, type Dispatch, type SetStateAction,
} from 'react'
import {
  flushProjectSaveWithSync,
  saveProjectWithSync,
} from '@/persistence/sync/session/syncService'
import { isRetryableRemoteDeferral } from '@/persistence/sync/project/projectSync'
import { useReportStore } from '@/report/reportStore'
import { holdsWriteLease } from '../../document/documentLease'
import { activeDocumentIdentity } from '../../document/documentIdentity'
import { publishDocumentInvalidation } from '../../document/documentMirror'
import { useProjectStore } from '../../projectStore'
import {
  hasPendingImportedTables,
  withoutRuntimeNodeState,
} from '../../document/transientProjectState'
import type { AppPhase, AppProviderState } from '../appContextValue'
import type { Edge, ProjectNode } from '@/types'

/**
 * Coalescing window for high-frequency edits. Never extended by later changes, so a
 * burst cannot postpone the write indefinitely; a crash inside the window loses the tail.
 */
const AUTOSAVE_INTERVAL_MS = 800

function holdsProjectWriteLease(projectId: string | null | undefined): boolean {
  const identity = activeDocumentIdentity(projectId)
  return Boolean(identity && holdsWriteLease(identity.key))
}

/**
 * Topology of what IndexedDB keeps. Pending imports use synthetic `pending:` fileRefs
 * stripped on write; comparing live node ids would treat a real fileRef promotion as a
 * no-op and leave a finished import on the debounce long enough to lose on reload.
 */
function durableDocumentTopology(
  nodes: Record<string, ProjectNode>,
  edges: Record<string, Edge>,
): string {
  const durable = withoutRuntimeNodeState(nodes)
  return `${Object.keys(durable).sort().join()}|${Object.keys(edges).sort().join()}`
}

interface AutosaveOptions {
  phase: AppPhase
  isAuthenticated: boolean
  projectId: string | null
  setState: Dispatch<SetStateAction<AppProviderState>>
}

export interface ProjectAutosave {
  saveLatestProject: () => Promise<void>
  /** Local durability only — import completion and bounded session exit. */
  flushLocalProjectSave: () => Promise<void>
  /** Persist a finished import while other imports may still be pending. */
  flushImportProjectSave: () => Promise<void>
  /** Local save plus a best-effort remote flush. */
  flushProjectSave: () => Promise<void>
}

export function useProjectAutosave({
  phase,
  isAuthenticated,
  projectId,
  setState,
}: AutosaveOptions): ProjectAutosave {
  const saveInFlight = useRef<Promise<void> | null>(null)
  const savePending = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaveStartedAt = useRef(0)
  const savedTopology = useRef('')
  const nodes = useProjectStore(store => store.nodes)
  const edges = useProjectStore(store => store.edges)
  const patches = useProjectStore(store => store.patches)
  const projectName = useProjectStore(store => store.projectName)
  const historyTransactionId = useProjectStore(
    store => store.history.transaction?.id ?? null,
  )

  const cancelPendingSave = useCallback(() => {
    if (!debounceTimer.current) return
    clearTimeout(debounceTimer.current)
    debounceTimer.current = null
  }, [])

  // Covers the coalescing window: pending work is not yet saved work.
  const markSaving = useCallback((saving: boolean) => {
    setState(previous => (previous.isSaving === saving
      ? previous
      : { ...previous, isSaving: saving }))
  }, [setState])

  const saveProjectSnapshot = useCallback(async (allowPendingImports: boolean) => {
    cancelPendingSave()
    if (useProjectStore.getState().history.transaction) {
      throw new Error('A table operation is still in progress.')
    }
    // Pending imports must not become the latest durable snapshot via pagehide/autosave.
    // Import completion is the exception: withoutRuntimeNodeState keeps the finished
    // table while still omitting other pending imports.
    if (
      !allowPendingImports
      && hasPendingImportedTables(useProjectStore.getState().nodes)
    ) {
      throw new Error('A table operation is still in progress.')
    }
    // Ownership must match the snapshot project, not merely some document in this tab.
    if (!holdsProjectWriteLease(useProjectStore.getState().projectId)) {
      markSaving(false)
      return
    }
    if (saveInFlight.current) {
      savePending.current = true
      await saveInFlight.current
      return
    }

    const save = async () => {
      markSaving(true)
      lastSaveStartedAt.current = Date.now()
      try {
        do {
          savePending.current = false
          const project = useProjectStore.getState()
          if (!project.projectId) break
          const identity = activeDocumentIdentity(project.projectId)
          if (!identity || !holdsWriteLease(identity.key)) break
          const topology = durableDocumentTopology(project.nodes, project.edges)
          await saveProjectWithSync(
            project.projectId,
            project.projectName,
            project.nodes,
            project.edges,
            project.patches,
            useReportStore.getState().reports,
          )
          // Advance topology only after a durable write so failures retry promptly.
          savedTopology.current = topology
          if (holdsWriteLease(identity.key)) publishDocumentInvalidation()
        } while (savePending.current)
      } finally {
        if (!debounceTimer.current) markSaving(false)
      }
    }
    const inFlight = save()
    saveInFlight.current = inFlight
    try {
      await inFlight
    } finally {
      if (saveInFlight.current === inFlight) saveInFlight.current = null
    }
  }, [cancelPendingSave, markSaving])

  const saveLatestProject = useCallback(
    () => saveProjectSnapshot(false),
    [saveProjectSnapshot],
  )

  // IndexedDB (+ sync enqueue) only — callers flush reports separately when needed.
  const flushLocalProjectSave = useCallback(async () => {
    await saveLatestProject()
  }, [saveLatestProject])

  const flushImportProjectSave = useCallback(async () => {
    await saveProjectSnapshot(true)
  }, [saveProjectSnapshot])

  const flushProjectSave = useCallback(async () => {
    await flushLocalProjectSave()
    const activeProjectId = useProjectStore.getState().projectId
    if (!activeProjectId || !holdsProjectWriteLease(activeProjectId)) return
    try {
      await flushProjectSaveWithSync(activeProjectId)
    } catch (error) {
      if (!isRetryableRemoteDeferral(error)) throw error
      console.warn('[AppContext] Retryable remote save deferred:', error)
    }
  }, [flushLocalProjectSave])

  const scheduleSave = useCallback(() => {
    if (!holdsProjectWriteLease(useProjectStore.getState().projectId)) return
    if (hasPendingImportedTables(useProjectStore.getState().nodes)) {
      cancelPendingSave()
      markSaving(false)
      return
    }
    markSaving(true)
    const project = useProjectStore.getState()
    if (project.history.transaction) {
      markSaving(false)
      return
    }
    const { nodes: current, edges: currentEdges } = project
    const structural = durableDocumentTopology(current, currentEdges) !== savedTopology.current
    if (structural) {
      cancelPendingSave()
    } else if (debounceTimer.current) {
      // An armed timer is never pushed back, so changes arriving during a burst are
      // batched into the save that is already coming rather than delaying it.
      return
    }
    const sinceLastSave = Date.now() - lastSaveStartedAt.current
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      void saveLatestProject().catch((error) => {
        console.error('[AppContext] Auto-save failed:', error)
      })
    }, structural ? 0 : Math.max(0, AUTOSAVE_INTERVAL_MS - sinceLastSave))
  }, [cancelPendingSave, markSaving, saveLatestProject])

  useEffect(() => {
    if (phase !== 'ready' || !isAuthenticated || !projectId) return
    scheduleSave()
  }, [
    edges,
    nodes,
    patches,
    projectName,
    historyTransactionId,
    isAuthenticated,
    phase,
    projectId,
    scheduleSave,
  ])

  useEffect(() => {
    const store = useReportStore as typeof useReportStore & {
      subscribe?: (
        listener: (state: ReturnType<typeof useReportStore.getState>) => void,
      ) => () => void
    }
    if (typeof store.subscribe !== 'function') return
    let previousReports = store.getState().reports
    return store.subscribe((reportState) => {
      if (reportState.reports === previousReports) return
      previousReports = reportState.reports
      scheduleSave()
    })
  }, [scheduleSave])

  useEffect(() => cancelPendingSave, [cancelPendingSave])

  return {
    saveLatestProject,
    flushLocalProjectSave,
    flushImportProjectSave,
    flushProjectSave,
  }
}
