import type { Edge, Patches, ProjectNode } from '@/types'
import { computePatchesVersion } from '@/engine/cacheUtils'
import { deserializePatches } from '@/persistence/patchSerialization'
import { loadProject } from '@/persistence/db'
import { loadReportsForProject } from '@/persistence/reportStorage'
import type { Report } from '@/report/types'
import { useReportStore } from '@/report/reportStore'
import { invalidateMaterializations } from '@/engine/materializationCoordinator'
import {
  documentMirrorChannel,
  documentTabId,
  type DocumentIdentity,
} from './documentIdentity'
import { useDataStore } from './dataStore'
import { useProjectStore } from './projectStore'
import { useTableRuntimeStore } from './tableRuntimeStore'
import { retainHistoryFileRefs } from '@/persistence/historyFileCleanup'

interface DocumentInvalidationMessage {
  type: 'document-changed'
  tabId: string
}

interface MirrorSession {
  identity: DocumentIdentity
  channel: BroadcastChannel | null
  stopped: boolean
  requestedGeneration: number
  appliedGeneration: number
  reload: Promise<void> | null
  onVisibilityChange: (() => void) | null
}

let session: MirrorSession | null = null

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

/** Replaces this tab's in-memory document with a durable snapshot. */
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
    // A reader never owns the editing history it observes.
    history: { past: [], future: [] },
  })
  retainHistoryFileRefs(session?.identity.scope ?? '', [])
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

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

async function reloadLatest(active: MirrorSession): Promise<void> {
  while (
    !active.stopped
    && isVisible()
    && active.appliedGeneration < active.requestedGeneration
  ) {
    const generation = active.requestedGeneration
    const [stored, reports] = await Promise.all([
      loadProject(active.identity.projectId, active.identity.scope),
      loadReportsForProject(active.identity.projectId, active.identity.scope),
    ])
    if (active.stopped) return
    // A newer invalidation arrived while IndexedDB was being read. Discard this
    // result and read once more so an older async completion can never win.
    if (generation !== active.requestedGeneration) continue
    if (stored) {
      applyDocumentSnapshot({
        name: stored.name,
        nodes: stored.nodes,
        edges: stored.edges,
        patches: deserializePatches(stored.patches),
        reports,
      })
    }
    active.appliedGeneration = generation
  }
}

function scheduleReload(active: MirrorSession): void {
  if (active.stopped || !isVisible() || active.reload) return
  const reload = reloadLatest(active)
  active.reload = reload
  void reload
    .catch(error => {
      console.error('[DocumentMirror] Could not refresh the reader:', error)
    })
    .finally(() => {
      if (active.reload === reload) active.reload = null
      if (
        !active.stopped
        && isVisible()
        && active.appliedGeneration < active.requestedGeneration
      ) scheduleReload(active)
    })
}

/**
 * Readers receive only a lightweight invalidation. The durable IndexedDB record is
 * the handoff boundary, so messages never carry a partially saved document.
 */
export function startDocumentMirror(identity: DocumentIdentity): () => void {
  stopDocumentMirror()
  const active: MirrorSession = {
    identity,
    channel: null,
    stopped: false,
    requestedGeneration: 0,
    appliedGeneration: 0,
    reload: null,
    onVisibilityChange: null,
  }
  session = active
  if (typeof BroadcastChannel !== 'undefined') {
    active.channel = new BroadcastChannel(documentMirrorChannel(identity.key))
    active.channel.onmessage = (event: MessageEvent<DocumentInvalidationMessage>) => {
      if (
        active.stopped
        || event.data?.type !== 'document-changed'
        || event.data.tabId === documentTabId()
      ) return
      active.requestedGeneration += 1
      scheduleReload(active)
    }
  }
  if (typeof document !== 'undefined') {
    active.onVisibilityChange = () => scheduleReload(active)
    document.addEventListener('visibilitychange', active.onVisibilityChange)
  }
  return () => {
    if (session === active) stopDocumentMirror()
  }
}

function stopDocumentMirror(): void {
  const active = session
  if (!active) return
  active.stopped = true
  active.channel?.close()
  if (active.onVisibilityChange && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', active.onVisibilityChange)
  }
  session = null
}

/** Called after the editor commits a complete document to IndexedDB. */
export function publishDocumentInvalidation(): void {
  session?.channel?.postMessage({
    type: 'document-changed',
    tabId: documentTabId(),
  } satisfies DocumentInvalidationMessage)
}
