/**
 * Dashboard shared types, helper functions, and utility hooks.
 */

import { useMemo, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useProfilingStore, loadProfileForTable } from '@/profiling/profiler'
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

export interface Insight {
  id: string
  type: 'high_missing' | 'key_candidate' | 'date_range' | 'category_distribution' | 'outliers' | 'completeness_warning'
  title: string
  description: string
  tableId: string
  tableName: string
  columnId?: string
  columnName?: string
  severity: 'info' | 'warning' | 'success'
  data?: Record<string, unknown>
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

/** Stale threshold in days */
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

export function formatStatValue(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  if (Number.isInteger(value)) {
    return value.toString()
  }
  return value.toFixed(2)
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

export function extractInsightsFromProfile(
  tableId: string,
  tableName: string,
  profile: ProfileResult | undefined,
  schema: TableSchema | undefined,
  rowCount: number
): Insight[] {
  const insights: Insight[] = []
  if (!profile?.columns || !schema) return insights

  for (const colProfile of profile.columns) {
    const schemaCol = schema.columns.find(c => c.id === colProfile.columnId)
    const columnName = schemaCol?.name || colProfile.columnId

    if (colProfile.missingPercent > 30) {
      insights.push({
        id: `missing-${tableId}-${colProfile.columnId}`,
        type: 'high_missing',
        title: `High Missing Values`,
        description: `"${columnName}" in "${tableName}" is ${Math.round(colProfile.missingPercent)}% empty`,
        tableId,
        tableName,
        columnId: colProfile.columnId,
        columnName,
        severity: 'warning',
        data: { missingPercent: colProfile.missingPercent, missingCount: colProfile.missingCount },
      })
    }

    if (colProfile.isKeyCandidate) {
      insights.push({
        id: `key-${tableId}-${colProfile.columnId}`,
        type: 'key_candidate',
        title: `Potential Key Column`,
        description: `"${columnName}" appears to be a unique identifier`,
        tableId,
        tableName,
        columnId: colProfile.columnId,
        columnName,
        severity: 'info',
        data: { distinctCount: colProfile.distinctCount },
      })
    }

    if (schemaCol?.type === 'date' && colProfile.min !== undefined && colProfile.max !== undefined) {
      insights.push({
        id: `daterange-${tableId}-${colProfile.columnId}`,
        type: 'date_range',
        title: `Date Range Detected`,
        description: `"${columnName}" spans from ${colProfile.min} to ${colProfile.max}`,
        tableId,
        tableName,
        columnId: colProfile.columnId,
        columnName,
        severity: 'info',
        data: { min: colProfile.min, max: colProfile.max },
      })
    }

    if (colProfile.topValues && colProfile.topValues.length > 0 && colProfile.topValues.length <= 10) {
      const total = colProfile.topValues.reduce((sum, tv) => sum + tv.count, 0)
      if (total > 0 && colProfile.distinctCount <= 10) {
        const topThree = colProfile.topValues.slice(0, 3)
        const distribution = topThree
          .map(tv => `${tv.value} (${Math.round((tv.count / total) * 100)}%)`)
          .join(', ')

        insights.push({
          id: `category-${tableId}-${colProfile.columnId}`,
          type: 'category_distribution',
          title: `Category Distribution`,
          description: `"${columnName}" has ${colProfile.distinctCount} values: ${distribution}`,
          tableId,
          tableName,
          columnId: colProfile.columnId,
          columnName,
          severity: 'info',
          data: { topValues: colProfile.topValues, distinctCount: colProfile.distinctCount },
        })
      }
    }
  }

  const completeness = computeTableCompleteness(profile, rowCount)
  if (completeness >= 95) {
    insights.push({
      id: `completeness-${tableId}`,
      type: 'completeness_warning',
      title: `Excellent Data Quality`,
      description: `"${tableName}" has ${completeness}% complete data`,
      tableId,
      tableName,
      severity: 'success',
      data: { completeness },
    })
  }

  return insights
}

export function useTableNodes(): TableNode[] {
  const nodes = useProjectStore((state) => state.nodes)

  return useMemo(() => {
    return Object.values(nodes).filter(
      (n): n is TableNode => n.kind === 'source_table' || n.kind === 'derived_table'
    )
  }, [nodes])
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
