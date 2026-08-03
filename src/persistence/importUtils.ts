import { deleteFileWithSync } from './syncService'

export function getTableCount(nodes: Record<string, { kind: string }>): number {
  return Object.values(nodes).filter(
    (node) => node.kind === 'source_table' || node.kind === 'derived_table',
  ).length
}

export interface ImportOrderable {
  /** Groups items that came from the same source file (e.g. every sheet in one
   *  workbook is one block; a standalone CSV is a block of one). Items never
   *  interleave across blocks — only the block order and the order within a block
   *  are chosen by size. */
  sourceKey: string
  rowCount: number
}

/**
 * Orders selected import items by size without scrambling which file each item came
 * from together. A block (one CSV, or every sheet of one workbook) is weighed by its
 * total row count, and blocks run smallest-total-first; within a block, its own items
 * also run smallest-first. So a small workbook's sheets all import — in size order —
 * before a much larger standalone CSV, but two sheets from the same workbook can never
 * end up separated by items from another file. Mirrors getDirtyTableRefreshOrder's
 * size heuristic for reload.
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
