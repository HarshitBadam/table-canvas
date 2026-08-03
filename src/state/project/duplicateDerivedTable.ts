import { ensureTableMaterialized } from '@/engine/materialization/materializationService'
import { readAllTableRows } from '@/engine/materialization/readAllTableRows'
import { createTableSnapshot } from '@/engine/parsing/tableSnapshot'
import {
  deleteFileWithSync,
  isNetworkOnline,
  uploadFileWithSync,
} from '@/persistence/sync/session/syncService'
import { isCloudStorageScope } from '@/persistence/storage/storageScope'
import {
  checkFileSize,
  checkRowCount,
  checkTableCount,
  type LimitExceeded,
} from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import type { SourceTableNode } from '@/types'
import { useProjectStore } from '../projectStore'
import { canWriteDocument } from '../document/transientProjectState'
import {
  effectiveTableSchema,
  getNodeCacheInfo,
} from '../tableRuntimeStore'
import {
  beginTableOperation,
  completeTableOperation,
  failTableOperation,
  isTableOperationCurrent,
  updateTableOperation,
  waitForTableOperation,
} from '../runtime/tableOperationCoordinator'

const SNAPSHOT_MIME_TYPE = 'application/octet-stream'
const TABLE_CHANGED_ERROR = 'The table changed while it was being copied. Please try again.'
const WRITE_LEASE_ERROR = 'Editing moved to another tab while the table was being copied. Please try again there.'

export type DuplicateDerivedTableResult =
  | { ok: true; tableId: string }
  | {
      ok: false
      code:
        | 'NOT_FOUND'
        | 'NOT_DERIVED'
        | 'MATERIALIZATION_FAILED'
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

  const schema = effectiveTableSchema(initialNode) ?? initialNode.schema
  if (!schema) {
    return failure('MATERIALIZATION_FAILED', 'The derived table schema is unavailable.')
  }

  const copyName = createCopyName(
    initialNode.name,
    Object.values(initialState.nodes).map(node => node.name),
  )
  const pendingFileRef = `pending:duplicate:${crypto.randomUUID()}`
  const duplicateId = initialState.addSourceTable({
    name: copyName,
    fileRef: pendingFileRef,
    fileName: `${sanitizeFileName(copyName)}.tablecanvas`,
    fileType: 'snapshot',
    schema,
    position: {
      x: initialNode.ui.position.x + 32,
      y: initialNode.ui.position.y + 32,
    },
    select: options?.selectDuplicate !== false,
  })
  const operationGeneration = beginTableOperation(duplicateId, 'waiting')

  void finalizeDerivedDuplicate({
    sourceTableId: tableId,
    duplicateId,
    projectId,
    tier,
    operationGeneration,
    sourceName: initialNode.name,
  })

  return { ok: true, tableId: duplicateId }
}

async function finalizeDerivedDuplicate(args: {
  sourceTableId: string
  duplicateId: string
  projectId: string
  tier: Tier
  operationGeneration: number
  sourceName: string
}): Promise<void> {
  const {
    sourceTableId,
    duplicateId,
    projectId,
    tier,
    operationGeneration,
    sourceName,
  } = args
  let uploadedFileId: string | undefined
  try {
    await waitForTableOperation(sourceTableId)
    if (!isTableOperationCurrent(duplicateId, operationGeneration)) return
    if (useProjectStore.getState().projectId !== projectId) {
      failTableOperation(duplicateId, operationGeneration, 'The active project changed while copying.')
      return
    }

    updateTableOperation(duplicateId, operationGeneration, { phase: 'materializing' })
    const materialized = await ensureTableMaterialized(sourceTableId)
    if (!isTableOperationCurrent(duplicateId, operationGeneration)) return
    if (materialized.status === 'error') {
      failTableOperation(
        duplicateId,
        operationGeneration,
        materialized.error || 'The derived table could not be calculated.',
      )
      return
    }

    const stateBeforeRead = useProjectStore.getState()
    const nodeBeforeRead = stateBeforeRead.nodes[sourceTableId]
    if (
      stateBeforeRead.projectId !== projectId
      || nodeBeforeRead?.kind !== 'derived_table'
    ) {
      failTableOperation(duplicateId, operationGeneration, TABLE_CHANGED_ERROR)
      return
    }
    const schema = effectiveTableSchema(nodeBeforeRead)
    if (!schema) {
      failTableOperation(
        duplicateId,
        operationGeneration,
        'The derived table schema is unavailable.',
      )
      return
    }
    const generation = captureGeneration(sourceTableId, nodeBeforeRead.updatedAt)
    updateTableOperation(duplicateId, operationGeneration, {
      phase: 'materializing',
      progress: { completed: 0, label: 'Reading rows' },
    })
    const rows = await readAllTableRows(sourceTableId, { raw: true })
    if (!isTableOperationCurrent(duplicateId, operationGeneration)) return

    const currentState = useProjectStore.getState()
    const currentNode = currentState.nodes[sourceTableId]
    if (
      currentState.projectId !== projectId
      || currentNode?.kind !== 'derived_table'
      || captureGeneration(sourceTableId, currentNode.updatedAt) !== generation
    ) {
      failTableOperation(duplicateId, operationGeneration, TABLE_CHANGED_ERROR)
      return
    }
    if (!canWriteDocument()) {
      failTableOperation(duplicateId, operationGeneration, WRITE_LEASE_ERROR)
      return
    }

    const rowLimit = checkRowCount(rows.length, tier)
    if (!rowLimit.ok) {
      failTableOperation(duplicateId, operationGeneration, rowLimit.reason)
      return
    }

    const snapshot = createTableSnapshot(schema, rows)
    const fileLimit = checkFileSize(snapshot.bytes.byteLength, tier)
    if (!fileLimit.ok) {
      failTableOperation(duplicateId, operationGeneration, fileLimit.reason)
      return
    }

    updateTableOperation(duplicateId, operationGeneration, {
      phase: 'uploading',
      progress: { completed: rows.length, total: rows.length, label: 'Saving snapshot' },
    })
    const fileName = `${sanitizeFileName(
      createCopyName(sourceName, Object.values(currentState.nodes).map(node => node.name)),
    )}.tablecanvas`
    const file = new File([snapshot.bytes], fileName, { type: SNAPSHOT_MIME_TYPE })
    const uploaded = await uploadFileWithSync(
      file,
      projectId,
      undefined,
      { requireRemoteWhenOnline: true },
    )
    uploadedFileId = uploaded.id
    if (!isTableOperationCurrent(duplicateId, operationGeneration)) {
      await discardUploadedSnapshot(uploadedFileId)
      return
    }

    const finalState = useProjectStore.getState()
    const finalSource = finalState.nodes[sourceTableId]
    const duplicate = finalState.nodes[duplicateId]
    if (
      finalState.projectId !== projectId
      || finalSource?.kind !== 'derived_table'
      || duplicate?.kind !== 'source_table'
      || captureGeneration(sourceTableId, finalSource.updatedAt) !== generation
    ) {
      await discardUploadedSnapshot(uploadedFileId)
      uploadedFileId = undefined
      failTableOperation(duplicateId, operationGeneration, TABLE_CHANGED_ERROR)
      return
    }
    if (!canWriteDocument()) {
      await discardUploadedSnapshot(uploadedFileId)
      uploadedFileId = undefined
      failTableOperation(duplicateId, operationGeneration, WRITE_LEASE_ERROR)
      return
    }

    finalState.updateNode(duplicateId, {
      schema: snapshot.schema,
      plan: {
        fileRef: uploaded.id,
        fileName: uploaded.name,
        fileType: 'snapshot',
        inferredSchemaVersion: 1,
      },
    } as Partial<SourceTableNode>)
    uploadedFileId = undefined

    updateTableOperation(duplicateId, operationGeneration, { phase: 'materializing' })
    const loaded = await ensureTableMaterialized(duplicateId)
    if (!isTableOperationCurrent(duplicateId, operationGeneration)) return
    if (loaded.status === 'error') {
      failTableOperation(
        duplicateId,
        operationGeneration,
        loaded.error || 'The editable copy could not be loaded.',
      )
      return
    }
    completeTableOperation(duplicateId, operationGeneration)
  } catch (error) {
    if (uploadedFileId) await discardUploadedSnapshot(uploadedFileId)
    if (!isTableOperationCurrent(duplicateId, operationGeneration)) return
    failTableOperation(
      duplicateId,
      operationGeneration,
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

function writeLeaseFailure(): DuplicateDerivedTableResult {
  return failure('WRITE_LEASE_LOST', WRITE_LEASE_ERROR)
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
