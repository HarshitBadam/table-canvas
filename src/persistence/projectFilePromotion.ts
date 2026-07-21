import type { ProjectNode } from '@/types'
import { loadFileRecord } from './fileStorage'
import { uploadFileWithSync } from './fileSync'
import { getStorageScope } from './storageScope'

export async function promoteLocalFileRefs(
  projectId: string,
  sourceNodes: Record<string, ProjectNode>,
  sourceScope = getStorageScope(),
): Promise<Record<string, ProjectNode>> {
  const nodes = structuredClone(sourceNodes)
  for (const node of Object.values(nodes)) {
    if (node.kind !== 'source_table' || !node.plan.fileRef.startsWith('local_file_')) {
      continue
    }
    const file = await loadFileRecord(node.plan.fileRef, sourceScope)
    if (!file) throw new Error(`Local data file for "${node.name}" is missing`)
    const uploaded = await uploadFileWithSync(
      new File([file.data], file.name, { type: file.type }),
      projectId,
      `promote:${sourceScope}:${projectId}:${node.plan.fileRef}`,
    )
    if (uploaded.id.startsWith('local_file_')) {
      throw new Error(`Could not upload data file for "${node.name}"`)
    }
    node.plan.fileRef = uploaded.id
  }
  return nodes
}
