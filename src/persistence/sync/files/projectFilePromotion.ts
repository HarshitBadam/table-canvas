import type { ProjectNode } from '@/types'
import { loadFileRecord } from '../../storage/local-db/fileStorage'
import { uploadFileWithSync } from './fileSync'
import {
  captureStorageScopeContext,
  getStorageScope,
  isStorageScopeContextCurrent,
  type StorageScopeContext,
} from '../../storage/storageScope'

export async function promoteLocalFileRefs(
  projectId: string,
  sourceNodes: Record<string, ProjectNode>,
  sourceScope = getStorageScope(),
  context = captureStorageScopeContext(),
): Promise<Record<string, ProjectNode>> {
  assertPromotionContext(sourceScope, context)
  const nodes = structuredClone(sourceNodes)
  for (const node of Object.values(nodes)) {
    if (node.kind !== 'source_table' || !node.plan.fileRef.startsWith('local_file_')) {
      continue
    }
    const file = await loadFileRecord(node.plan.fileRef, sourceScope)
    assertPromotionContext(sourceScope, context)
    if (!file) throw new Error(`Local data file for "${node.name}" is missing`)
    const uploaded = await uploadFileWithSync(
      new File([file.data], file.name, { type: file.type }),
      projectId,
      `promote:${sourceScope}:${projectId}:${node.plan.fileRef}`,
    )
    assertPromotionContext(sourceScope, context)
    if (uploaded.id.startsWith('local_file_')) {
      throw new Error(`Could not upload data file for "${node.name}"`)
    }
    node.plan.fileRef = uploaded.id
  }
  return nodes
}

function assertPromotionContext(scope: string, context: StorageScopeContext): void {
  if (scope !== context.scope || !isStorageScopeContextCurrent(context)) {
    throw new Error('The account changed while project files were being synchronized.')
  }
}
