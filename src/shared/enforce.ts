import { type Tier, getLimits } from './limits'

export interface LimitOk {
  ok: true
}

export interface LimitExceeded {
  ok: false
  reason: string
  limit: number
  tier: Tier
}

export type LimitCheck = LimitOk | LimitExceeded

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function checkFileSize(fileBytes: number, tier: Tier): LimitCheck {
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
  const { maxRowsPerTable } = getLimits(tier)
  if (rowCount <= maxRowsPerTable) return { ok: true }
  return {
    ok: false,
    reason: `Row count (${rowCount.toLocaleString()}) exceeds the ${maxRowsPerTable.toLocaleString()} row limit`,
    limit: maxRowsPerTable,
    tier,
  }
}

export function checkTableCount(currentTableCount: number, tier: Tier): LimitCheck {
  const { maxTablesPerProject } = getLimits(tier)
  if (currentTableCount < maxTablesPerProject) return { ok: true }
  return {
    ok: false,
    reason: `This project already has ${currentTableCount} tables (limit: ${maxTablesPerProject})`,
    limit: maxTablesPerProject,
    tier,
  }
}

export function checkProjectCount(currentProjectCount: number, tier: Tier): LimitCheck {
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
