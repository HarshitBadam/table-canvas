import { ensureTableMaterialized } from '@/engine/materializationService'
import { readAllTableRows } from '@/engine/readAllTableRows'
import { createTableSnapshot } from '@/engine/tableSnapshot'
import {
  deleteFileWithSync,
  isNetworkOnline,
  uploadFileWithSync,
} from '@/persistence/syncService'
import { isCloudStorageScope } from '@/persistence/storageScope'
import {
  checkFileSize,
  checkRowCount,
  checkTableCount,
  type LimitExceeded,
} from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { useProjectStore } from './projectStore'
import { canWriteDocument } from './transientProjectState'
import {
  effectiveTableSchema,
  getNodeCacheInfo,
} from './tableRuntimeStore'

// Use the long-supported binary upload type so signed-in duplication remains
// compatible with servers deployed before the internal snapshot format existed.
const SNAPSHOT_MIME_TYPE = 'application/octet-stream'

export type DuplicateDerivedTableResult =
  | { ok: true; tableId: string }
  | {
      ok: false
      code:
        | 'NOT_FOUND'
        | 'NOT_DERIVED'
        | 'MATERIALIZATION_FAILED'
        | 'TABLE_CHANGED'
        | 'DUPLICATE_FAILED'
        | 'WRITE_LEASE_LOST'
        | 'OFFLINE'
      error: string
    }
  | {
      ok: false
      code: 'LIMIT_EXCEEDED'
      error: string
      violation: LimitExceeded
    }

export async function duplicateDerivedTable(
  tableId: string,
  tier: Tier,
  options?: { selectDuplicate?: boolean },
): Promise<DuplicateDerivedTableResult> {
  const initialState = useProjectStore.getState()
  const projectId = initialState.projectId
  const initialNode = initialState.nodes[tableId]
  if (!initialNode) {
    return failure('NOT_FOUND', 'The table no longer exists.')
  }
  if (initialNode.kind !== 'derived_table') {
    return failure('NOT_DERIVED', 'Only derived tables need to be converted.')
  }
  if (isCloudStorageScope() && !isNetworkOnline()) {
    return failure(
      'OFFLINE',
      'Connect to the internet before creating an editable copy in a synced project.',
    )
  }
  if (!canWriteDocument()) return writeLeaseFailure()
  const initialCapacity = checkTableCount(tableCount(initialState.nodes), tier)
  if (!initialCapacity.ok) return limitFailure(initialCapacity)

  let uploadedFileId: string | undefined
  try {
    const materialized = await ensureTableMaterialized(tableId)
    if (materialized.status === 'error') {
      return failure(
        'MATERIALIZATION_FAILED',
        materialized.error || 'The derived table could not be calculated.',
      )
    }

    const stateBeforeRead = useProjectStore.getState()
    const nodeBeforeRead = stateBeforeRead.nodes[tableId]
    if (
      stateBeforeRead.projectId !== projectId
      || nodeBeforeRead?.kind !== 'derived_table'
    ) {
      return changedFailure()
    }
    const schema = effectiveTableSchema(nodeBeforeRead)
    if (!schema) {
      return failure('MATERIALIZATION_FAILED', 'The derived table schema is unavailable.')
    }
    const generation = captureGeneration(tableId, nodeBeforeRead.updatedAt)
    const rows = await readAllTableRows(tableId, { raw: true })

    const currentState = useProjectStore.getState()
    const currentNode = currentState.nodes[tableId]
    if (
      currentState.projectId !== projectId
      || currentNode?.kind !== 'derived_table'
      || captureGeneration(tableId, currentNode.updatedAt) !== generation
    ) {
      return changedFailure()
    }
    if (!canWriteDocument()) return writeLeaseFailure()

    const rowLimit = checkRowCount(rows.length, tier)
    if (!rowLimit.ok) return limitFailure(rowLimit)

    const snapshot = createTableSnapshot(schema, rows)
    const fileLimit = checkFileSize(snapshot.bytes.byteLength, tier)
    if (!fileLimit.ok) return limitFailure(fileLimit)

    const fileBaseName = createCopyName(
      initialNode.name,
      Object.values(currentState.nodes).map(node => node.name),
    )
    const fileName = `${sanitizeFileName(fileBaseName)}.tablecanvas`
    const file = new File([snapshot.bytes], fileName, { type: SNAPSHOT_MIME_TYPE })
    const uploaded = await uploadFileWithSync(
      file,
      projectId,
      undefined,
      { requireRemoteWhenOnline: true },
    )
    uploadedFileId = uploaded.id

    const finalState = useProjectStore.getState()
    const finalSource = finalState.nodes[tableId]
    if (
      finalState.projectId !== projectId
      || finalSource?.kind !== 'derived_table'
      || captureGeneration(tableId, finalSource.updatedAt) !== generation
    ) {
      await discardUploadedSnapshot(uploadedFileId)
      uploadedFileId = undefined
      return changedFailure()
    }
    if (!canWriteDocument()) {
      await discardUploadedSnapshot(uploadedFileId)
      uploadedFileId = undefined
      return writeLeaseFailure()
    }
    const finalCapacity = checkTableCount(tableCount(finalState.nodes), tier)
    if (!finalCapacity.ok) {
      await discardUploadedSnapshot(uploadedFileId)
      uploadedFileId = undefined
      return limitFailure(finalCapacity)
    }
    const copyName = createCopyName(
      finalSource.name,
      Object.values(finalState.nodes).map(node => node.name),
    )

    const duplicateId = finalState.addSourceTable({
      name: copyName,
      fileRef: uploaded.id,
      fileName: uploaded.name,
      fileType: 'snapshot',
      schema: snapshot.schema,
      position: {
        x: initialNode.ui.position.x + 32,
        y: initialNode.ui.position.y + 32,
      },
      select: options?.selectDuplicate !== false,
    })
    uploadedFileId = undefined
    return { ok: true, tableId: duplicateId }
  } catch (error) {
    if (uploadedFileId) await discardUploadedSnapshot(uploadedFileId)
    return failure(
      'DUPLICATE_FAILED',
      error instanceof Error ? error.message : 'The editable copy could not be created.',
    )
  }
}

function captureGeneration(tableId: string, updatedAt: string): string {
  const cache = getNodeCacheInfo(tableId)
  return JSON.stringify({
    updatedAt,
    version: cache?.currentVersionHash,
    revision: cache?.dataRevision ?? 0,
    dirty: cache?.isDirty ?? false,
  })
}

function createCopyName(sourceName: string, names: string[]): string {
  const existing = new Set(names)
  const base = `${sourceName} copy`
  let name = base
  let suffix = 2
  while (existing.has(name)) {
    name = `${base} ${suffix}`
    suffix += 1
  }
  return name
}

function sanitizeFileName(name: string): string {
  const invalidCharacters = '<>:"/\\|?*'
  const sanitized = Array.from(name, character =>
    character.charCodeAt(0) < 32 || invalidCharacters.includes(character)
      ? '_'
      : character,
  ).join('')
  return sanitized.trim() || 'table-copy'
}

function tableCount(nodes: ReturnType<typeof useProjectStore.getState>['nodes']): number {
  return Object.values(nodes).filter(node =>
    node.kind === 'source_table' || node.kind === 'derived_table',
  ).length
}

function failure(
  code: Exclude<DuplicateDerivedTableResult, { ok: true } | { code: 'LIMIT_EXCEEDED' }>['code'],
  error: string,
): DuplicateDerivedTableResult {
  return { ok: false, code, error }
}

function changedFailure(): DuplicateDerivedTableResult {
  return failure('TABLE_CHANGED', 'The table changed while it was being copied. Please try again.')
}

function writeLeaseFailure(): DuplicateDerivedTableResult {
  return failure(
    'WRITE_LEASE_LOST',
    'Editing moved to another tab while the table was being copied. Please try again there.',
  )
}

function limitFailure(violation: LimitExceeded): DuplicateDerivedTableResult {
  return {
    ok: false,
    code: 'LIMIT_EXCEEDED',
    error: violation.reason,
    violation,
  }
}

async function discardUploadedSnapshot(fileId: string): Promise<void> {
  try {
    await deleteFileWithSync(fileId, { strictRemote: true })
  } catch (error) {
    console.error('[duplicateDerivedTable] Failed to discard unused snapshot:', error)
  }
}
