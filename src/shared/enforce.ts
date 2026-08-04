import type { Patches, ProjectNode } from '@/types'
import { type Tier, getLimits, MAX_SAFE_TRANSFORM_OUTPUT_ROWS } from './limits'

interface LimitOk {
  ok: true
}

export interface LimitExceeded {
  ok: false
  reason: string
  limit: number
  tier: Tier
}

export type LimitCheck = LimitOk | LimitExceeded

interface SafetyLimitExceeded {
  ok: false
  reason: string
  limit: number
}

export type SafetyCheck = LimitOk | SafetyLimitExceeded

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function checkFileSize(fileBytes: number, tier: Tier): LimitCheck {
  if (tier === 'google') return { ok: true }
  const { maxFileSizeBytes } = getLimits(tier)
  if (fileBytes <= maxFileSizeBytes) return { ok: true }
  return {
    ok: false,
    reason: `File size (${formatBytes(fileBytes)}) exceeds the ${formatBytes(maxFileSizeBytes)} limit`,
    limit: maxFileSizeBytes,
    tier,
  }
}

export function checkRowCount(rowCount: number, tier: Tier): LimitCheck {
  if (tier === 'google') return { ok: true }
  const { maxRowsPerTable } = getLimits(tier)
  if (rowCount <= maxRowsPerTable) return { ok: true }
  return {
    ok: false,
    reason: `Row count (${rowCount.toLocaleString()}) exceeds the ${maxRowsPerTable.toLocaleString()} row limit`,
    limit: maxRowsPerTable,
    tier,
  }
}

/**
 * Memory safety for join/union output — never tier-exempt (unlike
 * checkRowCount). Treat failures as blocking, not as an upsell.
 */
export function checkTransformOutputSafety(rowCount: number): SafetyCheck {
  if (rowCount <= MAX_SAFE_TRANSFORM_OUTPUT_ROWS) return { ok: true }
  return {
    ok: false,
    reason: `would produce approximately ${rowCount.toLocaleString()} rows, which exceeds the ${MAX_SAFE_TRANSFORM_OUTPUT_ROWS.toLocaleString()}-row safety limit`,
    limit: MAX_SAFE_TRANSFORM_OUTPUT_ROWS,
  }
}

export function checkTableCount(currentTableCount: number, tier: Tier): LimitCheck {
  if (tier === 'google') return { ok: true }
  const { maxTablesPerProject } = getLimits(tier)
  if (currentTableCount < maxTablesPerProject) return { ok: true }
  return {
    ok: false,
    reason: `This project already has ${currentTableCount} tables (limit: ${maxTablesPerProject})`,
    limit: maxTablesPerProject,
    tier,
  }
}

/**
 * Validates persisted project contents (including imports) before
 * activation/sync. Creation flows use checkTableCount — they need capacity
 * before adding a table.
 */
export function checkProjectTableLimits(
  nodes: Record<string, ProjectNode>,
  tier: Tier,
  patches: Record<string, Patches> = {},
): LimitCheck {
  if (tier === 'google') return { ok: true }
  const tables = Object.values(nodes).filter(
    (node) => node.kind === 'source_table' || node.kind === 'derived_table',
  )
  const { maxTablesPerProject } = getLimits(tier)
  if (tables.length > maxTablesPerProject) {
    return {
      ok: false,
      reason: `This project has ${tables.length} tables (limit: ${maxTablesPerProject})`,
      limit: maxTablesPerProject,
      tier,
    }
  }

  for (const table of tables) {
    const sourceRowCount = table.kind === 'source_table'
      ? table.plan.initialRows?.length ?? 0
      : 0
    const baseRowCount = Math.max(table.schema?.rowCount ?? 0, sourceRowCount)
    const tablePatches = patches[table.id]
    const insertedRowIds = new Set(tablePatches?.insertedRows.map(row => row.rowId))
    const deletedBaseRows = [...(tablePatches?.deletedRows ?? [])]
      .filter(rowId => !insertedRowIds.has(rowId)).length
    const activeInsertedRows = tablePatches?.insertedRows
      .filter(row => !tablePatches.deletedRows.has(row.rowId)).length ?? 0
    const rowCount = Math.max(0, baseRowCount - deletedBaseRows) + activeInsertedRows
    const rowCountCheck = checkRowCount(rowCount, tier)
    if (!rowCountCheck.ok) {
      return {
        ...rowCountCheck,
        reason: `Table "${table.name}" has ${rowCount.toLocaleString()} rows (limit: ${rowCountCheck.limit.toLocaleString()})`,
      }
    }
  }

  return { ok: true }
}

export function checkProjectCount(currentProjectCount: number, tier: Tier): LimitCheck {
  if (tier === 'google') return { ok: true }
  const { maxProjects } = getLimits(tier)
  if (currentProjectCount < maxProjects) return { ok: true }
  return {
    ok: false,
    reason: `You already have ${currentProjectCount} projects (limit: ${maxProjects})`,
    limit: maxProjects,
    tier,
  }
}

export function checkStorageQuota(
  currentUsedBytes: number,
  newFileBytes: number,
  tier: Tier,
): LimitCheck {
  if (tier === 'google') return { ok: true }
  const limits = getLimits(tier)
  const maxBytes = limits.maxServerStorageBytes
  if (maxBytes == null) return { ok: true }
  const totalAfter = currentUsedBytes + newFileBytes
  if (totalAfter <= maxBytes) return { ok: true }
  return {
    ok: false,
    reason: `Adding this file (${formatBytes(newFileBytes)}) would exceed your ${formatBytes(maxBytes)} storage quota (${formatBytes(currentUsedBytes)} used)`,
    limit: maxBytes,
    tier,
  }
}
