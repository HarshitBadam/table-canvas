import type { Edge, Patches, ProjectNode } from '@/types'
import { computePatchesVersion } from '@/engine/cacheUtils'
import type { Report } from '@/report/types'
import { useReportStore } from '@/report/reportStore'
import { invalidateMaterializations } from '@/engine/materializationCoordinator'
import { documentMirrorChannel, documentTabId } from './documentIdentity'
import { useDataStore } from './dataStore'
import { useProjectStore } from './projectStore'
import { useTableRuntimeStore } from './tableRuntimeStore'
import { retainHistoryFileRefs } from '@/persistence/historyFileCleanup'
import { getStorageScope } from '@/persistence/storageScope'
import { withoutRuntimeNodeState } from './transientProjectState'

/**
 * Mirrors the owner's document into every other tab on the same document. Followers
 * never write the document, so this is one-way: the owner publishes after each
 * successful local save and followers apply. Applying only touches in-memory stores
 * plus per-tab runtime state, so an applied snapshot cannot bounce back as a save.
 */
interface DocumentSnapshotMessage {
  tabId: string
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  reports: Record<string, Report>
}

interface MirrorSession {
  channel: BroadcastChannel | null
  stopped: boolean
}

let session: MirrorSession | null = null

function serializablePatches(
  patches: Record<string, Patches>,
): Record<string, Patches> {
  return JSON.parse(JSON.stringify(patches, (_, value) => (
    value instanceof Set ? [...value] : value
  ))) as Record<string, Patches>
}

function revivePatches(patches: Record<string, Patches>): Record<string, Patches> {
  return Object.fromEntries(Object.entries(patches).map(([tableId, entry]) => {
    const raw = entry as unknown as {
      cellPatches?: Patches['cellPatches']
      insertedRows?: Patches['insertedRows']
      deletedRows?: string[] | Set<string>
      highlightedCells?: string[] | Set<string>
    }
    return [tableId, {
      cellPatches: raw.cellPatches ?? {},
      insertedRows: raw.insertedRows ?? [],
      deletedRows: new Set(raw.deletedRows ?? []),
      highlightedCells: new Set(raw.highlightedCells ?? []),
    }]
  }))
}

function changedTableIds(
  previous: Record<string, ProjectNode>,
  next: Record<string, ProjectNode>,
  previousPatches: Record<string, Patches>,
  nextPatches: Record<string, Patches>,
): string[] {
  const ids = new Set([...Object.keys(next), ...Object.keys(previous)])
  const changed: string[] = []
  for (const id of ids) {
    const node = next[id]
    if (node?.kind !== 'source_table' && node?.kind !== 'derived_table') continue
    if (
      previous[id]?.updatedAt !== node.updatedAt
      || computePatchesVersion(previousPatches[id])
        !== computePatchesVersion(nextPatches[id])
    ) changed.push(id)
  }
  return changed
}

/** Replaces this tab's in-memory document; used by mirrors and on lease promotion. */
export function applyDocumentSnapshot(snapshot: {
  name: string
  nodes: Record<string, ProjectNode>
  edges: Record<string, Edge>
  patches: Record<string, Patches>
  reports?: Record<string, Report>
}): void {
  const project = useProjectStore.getState()
  const patches = revivePatches(snapshot.patches)
  const changed = changedTableIds(project.nodes, snapshot.nodes, project.patches, patches)

  invalidateMaterializations()
  useProjectStore.setState({
    projectName: snapshot.name,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    patches,
    selectedNodeId: project.selectedNodeId && snapshot.nodes[project.selectedNodeId]
      ? project.selectedNodeId
      : null,
    // Another tab's edits are not this tab's undo stack.
    history: { past: [], future: [] },
  })
  retainHistoryFileRefs(getStorageScope(), [])
  const runtime = useTableRuntimeStore.getState()
  runtime.forgetNodes(
    Object.keys(project.nodes).filter(id => !(id in snapshot.nodes)),
  )
  runtime.clearSchemas(changed)
  runtime.invalidateNodes(changed)
  for (const id of changed) useDataStore.getState().clearTableData(id)

  if (!snapshot.reports) return
  const reports = snapshot.reports
  const selected = useReportStore.getState().selectedReportId
  useReportStore.setState({
    reports,
    selectedReportId: selected && reports[selected]
      ? selected
      : Object.values(reports)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null,
  })
}

export function startDocumentMirror(key: string): () => void {
  stopDocumentMirror()
  const active: MirrorSession = { channel: null, stopped: false }
  session = active
  if (typeof BroadcastChannel !== 'undefined') {
    active.channel = new BroadcastChannel(documentMirrorChannel(key))
    active.channel.onmessage = (event: MessageEvent<DocumentSnapshotMessage>) => {
      if (active.stopped || event.data?.tabId === documentTabId()) return
      applyDocumentSnapshot(event.data)
    }
  }
  return () => {
    if (session === active) stopDocumentMirror()
  }
}

function stopDocumentMirror(): void {
  if (!session) return
  session.stopped = true
  session.channel?.close()
  session = null
}

/** Called by the owner after a save lands in IndexedDB. */
export function publishDocumentSnapshot(): void {
  if (!session?.channel) return
  const project = useProjectStore.getState()
  // Publish the durable graph only — incomplete `pending:` imports are stripped the
  // same way IndexedDB writes are, so mirrors never show tables that cannot survive a
  // reload.
  session.channel.postMessage({
    tabId: documentTabId(),
    name: project.projectName,
    nodes: withoutRuntimeNodeState(project.nodes),
    edges: project.edges,
    patches: serializablePatches(project.patches),
    reports: useReportStore.getState().reports,
  } satisfies DocumentSnapshotMessage)
}
