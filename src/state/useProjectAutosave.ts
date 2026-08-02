import {
  useCallback, useEffect, useRef, type Dispatch, type SetStateAction,
} from 'react'
import {
  flushProjectSaveWithSync,
  saveProjectWithSync,
} from '@/persistence/syncService'
import { isRetryableRemoteDeferral } from '@/persistence/projectSync'
import { useReportStore } from '@/report/reportStore'
import { holdsWriteLease } from './documentLease'
import { publishDocumentSnapshot } from './documentMirror'
import { useProjectStore } from './projectStore'
import type { AppPhase, AppProviderState } from './appContextValue'

/**
 * Coalescing window for the high-frequency edits — cell values, positions, report text —
 * that would otherwise write the whole document on every keystroke or drag frame. A
 * crash inside the window loses the tail of a burst, which is the accepted trade-off.
 * The window is never extended by later changes, so a stream of them cannot postpone the
 * write indefinitely.
 */
const AUTOSAVE_INTERVAL_MS = 800

/**
 * Adding or removing a table or a connection is a discrete, deliberate act rather than a
 * burst frame. Coalescing those buys nothing and risks losing a whole table to a reload,
 * so they are written straight away and only the edits within them are batched.
 */
function documentTopology(
  nodes: Record<string, unknown>,
  edges: Record<string, unknown>,
): string {
  return `${Object.keys(nodes).sort().join()}|${Object.keys(edges).sort().join()}`
}

interface AutosaveOptions {
  phase: AppPhase
  isAuthenticated: boolean
  projectId: string | null
  setState: Dispatch<SetStateAction<AppProviderState>>
}

export interface ProjectAutosave {
  saveLatestProject: () => Promise<void>
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

  /** Covers the coalescing window too: pending work is not saved work. */
  const markSaving = useCallback((saving: boolean) => {
    setState(previous => (previous.isSaving === saving
      ? previous
      : { ...previous, isSaving: saving }))
  }, [setState])

  const saveLatestProject = useCallback(async () => {
    cancelPendingSave()
    if (useProjectStore.getState().history.transaction) {
      throw new Error('A table operation is still in progress.')
    }
    // Mirror tabs hold the same stores but must never write the document.
    if (!holdsWriteLease()) {
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
          const topology = documentTopology(project.nodes, project.edges)
          await saveProjectWithSync(
            project.projectId,
            project.projectName,
            project.nodes,
            project.edges,
            project.patches,
            useReportStore.getState().reports,
          )
          // Only once it is durable, so a failed write retries without waiting.
          savedTopology.current = topology
          publishDocumentSnapshot()
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

  const flushProjectSave = useCallback(async () => {
    await saveLatestProject()
    const activeProjectId = useProjectStore.getState().projectId
    if (!activeProjectId || !holdsWriteLease()) return
    try {
      await flushProjectSaveWithSync(activeProjectId)
    } catch (error) {
      if (!isRetryableRemoteDeferral(error)) throw error
      console.warn('[AppContext] Retryable remote save deferred:', error)
    }
  }, [saveLatestProject])

  const scheduleSave = useCallback(() => {
    if (!holdsWriteLease()) return
    markSaving(true)
    const project = useProjectStore.getState()
    if (project.history.transaction) {
      markSaving(false)
      return
    }
    const { nodes: current, edges: currentEdges } = project
    const structural = documentTopology(current, currentEdges) !== savedTopology.current
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

  return { saveLatestProject, flushProjectSave }
}
