import { useEffect } from 'react'
import { loadProject } from '@/persistence/db'
import { deserializePatches } from '@/persistence/patchSerialization'
import { loadReportsForProject } from '@/persistence/reportStorage'
import type { DocumentIdentity } from './documentIdentity'
import {
  holdsWriteLease,
  startDocumentLease,
} from './documentLease'
import {
  applyDocumentSnapshot,
  startDocumentMirror,
} from './documentMirror'
import { setDocumentWriteGuard } from './transientProjectState'

interface CoordinationOptions {
  identity: DocumentIdentity | null
}

async function adoptLatestLocalSnapshot(identity: DocumentIdentity): Promise<void> {
  const stored = await loadProject(identity.projectId, identity.scope)
  if (!stored) throw new Error('The durable project snapshot is unavailable.')
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
 * Binds this tab to the active document: one explicit writer, everyone else a
 * durable reader. Focus and visibility never change ownership.
 */
export function useDocumentCoordination({
  identity,
}: CoordinationOptions): void {
  useEffect(() => {
    if (!identity) return
    const stopMirror = startDocumentMirror(identity)
    const stopLease = startDocumentLease({
      key: identity.key,
      // The previous owner's final durable save is authoritative before this tab
      // re-enables writes.
      onPromoted: () => adoptLatestLocalSnapshot(identity),
    })
    setDocumentWriteGuard(holdsWriteLease)
    return () => {
      setDocumentWriteGuard(null)
      stopLease()
      stopMirror()
    }
  }, [identity])
}
