import { useEffect, useRef } from 'react'
import { loadProject } from '@/persistence/db'
import { deserializePatches } from '@/persistence/patchSerialization'
import { loadReportsForProject } from '@/persistence/reportStorage'
import { useReportStore } from '@/report/reportStore'
import type { DocumentIdentity } from './documentIdentity'
import {
  holdsWriteLease,
  startDocumentLease,
  requestWriteLease,
  getLeaseState,
  subscribeLease,
} from './documentLease'
import {
  applyDocumentSnapshot,
  startDocumentMirror,
} from './documentMirror'
import { setDocumentWriteGuard } from './transientProjectState'

/** A tab has to hold focus this long before editing follows it. */
const FOCUS_HANDOVER_MS = 400

interface CoordinationOptions {
  identity: DocumentIdentity | null
  /** Persists everything this tab has, used before the lease is handed over. */
  flush: () => Promise<void>
}

async function adoptLatestLocalSnapshot(identity: DocumentIdentity): Promise<void> {
  const stored = await loadProject(identity.projectId, identity.scope)
  if (!stored) return
  const reports = await loadReportsForProject(identity.projectId, identity.scope)
  applyDocumentSnapshot({
    name: stored.name,
    nodes: stored.nodes,
    edges: stored.edges,
    patches: deserializePatches(stored.patches),
    reports,
  })
}

/**
 * Binds this tab to the active document: one writer, everyone else a live mirror.
 * Editing follows sustained focus so switching tabs and typing just works.
 */
export function useDocumentCoordination({
  identity,
  flush,
}: CoordinationOptions): void {
  const flushRef = useRef(flush)
  flushRef.current = flush

  useEffect(() => {
    if (!identity) return
    const stopMirror = startDocumentMirror(identity.key)
    const stopLease = startDocumentLease({
      key: identity.key,
      flush: async () => {
        await flushRef.current()
        await useReportStore.getState().flushSaves()
      },
      // A mirror can lag the owner by one publish; read the document back before
      // this tab starts writing it.
      onPromoted: () => adoptLatestLocalSnapshot(identity),
    })
    setDocumentWriteGuard(holdsWriteLease)
    return () => {
      setDocumentWriteGuard(null)
      stopLease()
      stopMirror()
    }
  }, [identity])

  useEffect(() => {
    if (!identity) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const cancel = () => {
      if (!timer) return
      clearTimeout(timer)
      timer = null
    }
    const scheduleHandover = () => {
      cancel()
      if (document.visibilityState === 'hidden' || !document.hasFocus()) return
      const lease = getLeaseState()
      // A refusal is the owner saying it cannot let go, so wait for "Try again"
      // instead of asking again every time the state moves.
      if (lease.role === 'owner' || lease.refused) return
      timer = setTimeout(() => {
        timer = null
        requestWriteLease()
      }, FOCUS_HANDOVER_MS)
    }
    window.addEventListener('focus', scheduleHandover)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', scheduleHandover)
    // Another tab can take the document while this one is already in front, which
    // fires no focus event; the rule still has to apply to the tab being used.
    const stopWatchingLease = subscribeLease(scheduleHandover)
    scheduleHandover()
    return () => {
      cancel()
      stopWatchingLease()
      window.removeEventListener('focus', scheduleHandover)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', scheduleHandover)
    }
  }, [identity])
}
