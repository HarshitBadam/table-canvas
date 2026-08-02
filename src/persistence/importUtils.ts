import { deleteFileWithSync } from './syncService'

export function getTableCount(nodes: Record<string, { kind: string }>): number {
  return Object.values(nodes).filter(
    (node) => node.kind === 'source_table' || node.kind === 'derived_table',
  ).length
}

export async function discardFiles(fileIds: string[]): Promise<void> {
  await Promise.allSettled(
    fileIds.map(fileId => deleteFileWithSync(fileId, { strictRemote: true })),
  )
}
