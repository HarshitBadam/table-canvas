import { useMemo, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import {
  getTableProfileVersionForNode,
  loadProfileForTable,
  useProfilingStore,
} from '@/lib/profiling'
import { formatNumber, getTableNodes } from '@/lib/utils'
import type {
  TableNode,
  ChartNode,
  TableSchema,
} from '@/types'
import type { ProfileResult } from '@/engine/types'

export interface DataQualityIssue {
  type: 'missing' | 'duplicate' | 'type_suggestion' | 'outlier' | 'whitespace'
  severity: 'low' | 'medium' | 'high'
  description: string
  columnId?: string
  columnName?: string
  affectedCount?: number
}

export interface TableQualityMetrics {
  tableId: string
  tableName: string
  tableKind: 'source_table' | 'derived_table'
  rowCount: number
  columnCount: number
  completeness: number
  issueCount: number
  hasProfile: boolean
  freshnessLabel: string
}

export interface ProjectHealthMetrics {
  overallCompleteness: number
  totalTables: number
  totalRows: number
  totalColumns: number
}

export interface LineageNode {
  id: string
  name: string
  kind: 'source_table' | 'derived_table' | 'chart'
  rowCount: number
  chartType?: string
}

export interface LineageEdge {
  id: string
  from: string
  to: string
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'Unknown'

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`
}

export function computeTableCompleteness(profile: ProfileResult | undefined, rowCount: number): number {
  if (!profile?.columns || profile.columns.length === 0) return 100

  const totalCells = profile.columns.length * rowCount
  if (totalCells === 0) return 100

  const missingCells = profile.columns.reduce((sum, col) => sum + col.missingCount, 0)
  return Math.round(((totalCells - missingCells) / totalCells) * 100)
}

export function extractIssuesFromProfile(
  profile: ProfileResult | undefined,
  schema: TableSchema | undefined
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = []
  if (!profile?.columns || !schema) return issues

  for (const colProfile of profile.columns) {
    const schemaCol = schema.columns.find(c => c.id === colProfile.columnId)
    const columnName = schemaCol?.name || colProfile.columnId

    if (colProfile.missingPercent > 10) {
      issues.push({
        type: 'missing',
        severity: colProfile.missingPercent > 50 ? 'high' : colProfile.missingPercent > 25 ? 'medium' : 'low',
        description: `${Math.round(colProfile.missingPercent)}% missing values`,
        columnId: colProfile.columnId,
        columnName,
        affectedCount: colProfile.missingCount,
      })
    }

    if (colProfile.isKeyCandidate === false && colProfile.semanticHints?.includes('id')) {
      const duplicateCount = (profile.rowCount || 0) - colProfile.distinctCount
      if (duplicateCount > 0) {
        issues.push({
          type: 'duplicate',
          severity: duplicateCount > 100 ? 'medium' : 'low',
          description: `${duplicateCount} potential duplicate values`,
          columnId: colProfile.columnId,
          columnName,
          affectedCount: duplicateCount,
        })
      }
    }

    // Skip outlier detection for ID-like columns or columns with very few values
    const isLikelyId = colProfile.isKeyCandidate ||
      colProfile.semanticHints?.includes('id') ||
      (colProfile.distinctCount === profile.rowCount && profile.rowCount > 0)

    if (!isLikelyId && colProfile.iqr !== undefined && colProfile.q1 !== undefined && colProfile.q3 !== undefined) {
      const lowerBound = colProfile.q1 - 1.5 * colProfile.iqr
      const upperBound = colProfile.q3 + 1.5 * colProfile.iqr

      const hasIQR = colProfile.iqr > 0
      const hasLowOutlier = colProfile.min !== undefined && colProfile.min < lowerBound
      const hasHighOutlier = colProfile.max !== undefined && colProfile.max > upperBound

      // Only flag if outlier is > 1 IQR beyond the bound (very extreme)
      if (hasIQR && hasLowOutlier) {
        const distance = lowerBound - colProfile.min!
        const extremeRatio = distance / colProfile.iqr
        if (extremeRatio > 1) {
          issues.push({
            type: 'outlier',
            severity: 'low',
            description: `Extreme low value: ${formatNumber(colProfile.min!, { compact: true })}`,
            columnId: colProfile.columnId,
            columnName,
          })
        }
      }
      if (hasIQR && hasHighOutlier) {
        const distance = colProfile.max! - upperBound
        const extremeRatio = distance / colProfile.iqr
        if (extremeRatio > 1) {
          issues.push({
            type: 'outlier',
            severity: 'low',
            description: `Extreme high value: ${formatNumber(colProfile.max!, { compact: true })}`,
            columnId: colProfile.columnId,
            columnName,
          })
        }
      }
    }
  }

  return issues
}

export function useTableNodes(): TableNode[] {
  const nodes = useProjectStore((state) => state.nodes)

  return useMemo(() => getTableNodes(nodes), [nodes])
}

export function useChartNodes(): ChartNode[] {
  const nodes = useProjectStore((state) => state.nodes)

  return useMemo(() => {
    return Object.values(nodes).filter(
      (n): n is ChartNode => n.kind === 'chart'
    )
  }, [nodes])
}

export function useAllProfiles() {
  const tableNodes = useTableNodes()
  const cachedProfiles = useProfilingStore((state) => state.profiles)
  const profileVersions = useProfilingStore((state) => state.profileVersions)
  const loading = useProfilingStore((state) => state.loading)
  const loadingVersions = useProfilingStore((state) => state.loadingVersions)
  const profiles = useMemo(() => Object.fromEntries(
    tableNodes.flatMap((table) => {
      const version = getTableProfileVersionForNode(table)
      const profile = cachedProfiles[table.id]
      return profile && profileVersions[table.id] === version
        ? [[table.id, profile]]
        : []
    }),
  ), [tableNodes, cachedProfiles, profileVersions])

  useEffect(() => {
    for (const table of tableNodes) {
      const version = getTableProfileVersionForNode(table)
      const isLoadingCurrent = loading[table.id] && loadingVersions[table.id] === version
      if (!profiles[table.id] && !isLoadingCurrent) {
        loadProfileForTable(table.id)
      }
    }
  }, [tableNodes, profiles, loading, loadingVersions])

  const isLoading = useMemo(() => {
    return tableNodes.some((table) => {
      const version = getTableProfileVersionForNode(table)
      return (
        (loading[table.id] && loadingVersions[table.id] === version)
        || !profiles[table.id]
      )
    })
  }, [tableNodes, profiles, loading, loadingVersions])

  return { profiles, isLoading }
}
