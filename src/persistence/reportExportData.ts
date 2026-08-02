import { getTableData } from '@/engine/tableDataService'
import type { Report } from '@/report/types'
import type { ProjectNode } from '@/types'
import {
  buildEmbeddedDataMap,
  collectEmbeddedTableIds,
  type EmbeddedDataMap,
} from './reportHtmlGenerator'

/**
 * Resolves the table rows every embedded table/chart in a report needs.
 *
 * A failed read degrades to an empty row set so one broken source cannot abort a
 * whole export; the generator renders a placeholder block in its place.
 */
export async function buildReportEmbeddedData(
  report: Report,
  nodes: Record<string, ProjectNode>,
): Promise<EmbeddedDataMap> {
  if (!report.tiptapContent) return {}

  const limits = new Map<string, number>()
  for (const { tableId, rowLimit } of collectEmbeddedTableIds(report.tiptapContent)) {
    limits.set(tableId, Math.max(limits.get(tableId) ?? 0, rowLimit))
  }

  const entries = await Promise.all([...limits].map(async ([tableId, rowLimit]) => {
    try {
      const result = await getTableData(tableId, 0, rowLimit)
      if (result.error) {
        console.error(`[Export] Failed to read embedded table ${tableId}:`, result.error)
        return { tableId, rows: [] }
      }
      return { tableId, rows: result.rows }
    } catch (error) {
      console.error(`[Export] Failed to read embedded table ${tableId}:`, error)
      return { tableId, rows: [] }
    }
  }))

  return buildEmbeddedDataMap(entries, nodes)
}
