import { deleteFileWithSync } from './syncService'

export function getTableCount(nodes: Record<string, { kind: string }>): number {
  return Object.values(nodes).filter(
    (node) => node.kind === 'source_table' || node.kind === 'derived_table',
  ).length
}

export interface ImportOrderable {
  /** Same-file block key (workbook sheets share one; a CSV is its own block). */
  sourceKey: string
  rowCount: number
}

/**
 * Smallest-total block first, then smallest item within each block. Items that
 * share a sourceKey stay contiguous so workbook sheets are never interleaved
 * with another file. Mirrors getDirtyTableRefreshOrder's size heuristic.
 */
export function getImportProcessingOrder<T extends ImportOrderable>(items: T[]): T[] {
  const blockOrder: string[] = []
  const blocks = new Map<string, T[]>()
  for (const item of items) {
    let block = blocks.get(item.sourceKey)
    if (!block) {
      block = []
      blocks.set(item.sourceKey, block)
      blockOrder.push(item.sourceKey)
    }
    block.push(item)
  }

  const blockTotal = (key: string): number =>
    blocks.get(key)!.reduce((sum, item) => sum + item.rowCount, 0)

  return [...blockOrder]
    .sort((a, b) => blockTotal(a) - blockTotal(b))
    .flatMap((key) => [...blocks.get(key)!].sort((a, b) => a.rowCount - b.rowCount))
}

export async function discardFiles(fileIds: string[]): Promise<void> {
  await Promise.allSettled(
    fileIds.map(fileId => deleteFileWithSync(fileId, { strictRemote: true })),
  )
}
