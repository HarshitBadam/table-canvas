import { useMemo, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useProfilingStore, loadProfileForTable } from '@/lib/profiling'
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

export interface ColumnTypeBreakdown {
  numeric: number
  categorical: number
  boolean: number
  date: number
  other: number
}

export interface TableQualityMetrics {
  tableId: string
  tableName: string
  tableKind: 'source_table' | 'derived_table'
  rowCount: number
  columnCount: number
  completeness: number
  issueCount: number
  issues: DataQualityIssue[]
  isLoading: boolean
  hasProfile: boolean
  importedAt: string | null
  isStale: boolean
  freshnessLabel: string
  typeBreakdown: ColumnTypeBreakdown
}

export interface ProjectHealthMetrics {
  overallCompleteness: number
  totalIssues: number
  tablesWithIssues: number
  totalTables: number
  totalRows: number
  totalColumns: number
  chartCount: number
  isLoading: boolean
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

const STALE_THRESHOLD_DAYS = 7

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

export function isDataStale(dateString: string | null | undefined): boolean {
  if (!dateString) return false
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays > STALE_THRESHOLD_DAYS
}

export function computeTypeBreakdown(schema: TableSchema | undefined): ColumnTypeBreakdown {
  const breakdown: ColumnTypeBreakdown = {
    numeric: 0,
    categorical: 0,
    boolean: 0,
    date: 0,
    other: 0,
  }

  if (!schema?.columns) return breakdown

  for (const col of schema.columns) {
    const t = col.type.toLowerCase()
    if (t === 'number' || t === 'integer' || t === 'float' || t === 'double') {
      breakdown.numeric++
    } else if (t === 'boolean' || t === 'bool') {
      breakdown.boolean++
    } else if (t === 'date' || t === 'datetime' || t === 'timestamp') {
      breakdown.date++
    } else if (t === 'string' || t === 'varchar' || t === 'text') {
      breakdown.categorical++
    } else {
      breakdown.other++
    }
  }

  return breakdown
}

/** @deprecated Use `formatNumber(value, { compact: true })` from `@/lib/utils` instead. */
export function formatStatValue(value: number): string {
  return formatNumber(value, { compact: true })
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
            description: `Extreme low value: ${formatStatValue(colProfile.min!)}`,
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
            description: `Extreme high value: ${formatStatValue(colProfile.max!)}`,
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
  const profiles = useProfilingStore((state) => state.profiles)
  const loading = useProfilingStore((state) => state.loading)

  useEffect(() => {
    for (const table of tableNodes) {
      if (!profiles[table.id] && !loading[table.id]) {
        loadProfileForTable(table.id)
      }
    }
  }, [tableNodes, profiles, loading])

  const isLoading = useMemo(() => {
    return tableNodes.some(t => loading[t.id] || !profiles[t.id])
  }, [tableNodes, profiles, loading])

  return { profiles, isLoading }
}
