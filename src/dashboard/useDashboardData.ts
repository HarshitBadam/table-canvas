/**
 * Dashboard Data Hooks
 * 
 * Aggregates data from profiling, suggestions, and project stores
 * to power the dashboard components.
 */

import { useMemo, useEffect, useCallback } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import { useProfilingStore, loadProfileForTable } from '@/profiling/profiler'
import { generateSuggestions } from '@/suggestions/suggestionEngine'
import { generateTableVersionHash } from '@/suggestions/suggestionsStore'
import type { 
  TableNode, 
  ChartNode, 
  Suggestion,
  TableSchema,
} from '@/lib/types'
import type { ProfileResult } from '@/engine/types'

// ============================================================================
// Types
// ============================================================================

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
  completeness: number // 0-100
  issueCount: number
  issues: DataQualityIssue[]
  isLoading: boolean
  hasProfile: boolean
  // Freshness fields
  importedAt: string | null
  isStale: boolean // >7 days old for source tables
  freshnessLabel: string // "Imported yesterday", "5 days ago", etc.
  // Type breakdown
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
  chartType?: string // For charts: 'bar', 'line', 'pie', etc.
}

export interface LineageEdge {
  id: string
  from: string
  to: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Stale threshold in days */
const STALE_THRESHOLD_DAYS = 7

/**
 * Format a date as a relative time string
 */
function formatRelativeTime(dateString: string | null | undefined): string {
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

/**
 * Check if a date is stale (older than threshold)
 */
function isDataStale(dateString: string | null | undefined): boolean {
  if (!dateString) return false
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays > STALE_THRESHOLD_DAYS
}

/**
 * Compute column type breakdown from schema
 */
function computeTypeBreakdown(schema: TableSchema | undefined): ColumnTypeBreakdown {
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

/**
 * Format a numeric stat value for display
 */
function formatStatValue(value: number): string {
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

function computeTableCompleteness(profile: ProfileResult | undefined, rowCount: number): number {
  if (!profile?.columns || profile.columns.length === 0) return 100
  
  const totalCells = profile.columns.length * rowCount
  if (totalCells === 0) return 100
  
  const missingCells = profile.columns.reduce((sum, col) => sum + col.missingCount, 0)
  return Math.round(((totalCells - missingCells) / totalCells) * 100)
}

function extractIssuesFromProfile(
  profile: ProfileResult | undefined,
  schema: TableSchema | undefined
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = []
  if (!profile?.columns || !schema) return issues

  for (const colProfile of profile.columns) {
    const schemaCol = schema.columns.find(c => c.id === colProfile.columnId)
    const columnName = schemaCol?.name || colProfile.columnId

    // High missing values (>10%)
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

    // Potential duplicates (for columns that look like they should be unique)
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

    // Outliers detection - only flag if significant
    // Skip outlier detection for ID-like columns or columns with very few values
    const isLikelyId = colProfile.isKeyCandidate || 
      colProfile.semanticHints?.includes('id') ||
      (colProfile.distinctCount === profile.rowCount && profile.rowCount > 0)
    
    if (!isLikelyId && colProfile.iqr !== undefined && colProfile.q1 !== undefined && colProfile.q3 !== undefined) {
      const lowerBound = colProfile.q1 - 1.5 * colProfile.iqr
      const upperBound = colProfile.q3 + 1.5 * colProfile.iqr
      
      // Only flag if IQR is meaningful (not zero) and we have actual outliers
      const hasIQR = colProfile.iqr > 0
      const hasLowOutlier = colProfile.min !== undefined && colProfile.min < lowerBound
      const hasHighOutlier = colProfile.max !== undefined && colProfile.max > upperBound
      
      // Calculate how extreme the outlier is (ratio of distance beyond bound vs IQR)
      // Only flag if the outlier is significantly beyond the bound
      if (hasIQR && hasLowOutlier) {
        const distance = lowerBound - colProfile.min!
        const extremeRatio = distance / colProfile.iqr
        // Only flag if outlier is > 1 IQR beyond the bound (i.e., very extreme)
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
        // Only flag if outlier is > 1 IQR beyond the bound (i.e., very extreme)
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

function extractInsightsFromProfile(
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

    // High missing columns (>30%)
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

    // Key candidates
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

    // Date ranges (for date columns)
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

    // Category distribution (low cardinality columns)
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

  // Completeness success
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

// ============================================================================
// Main Hooks
// ============================================================================

/**
 * Hook to get all table nodes from the project
 */
export function useTableNodes(): TableNode[] {
  const nodes = useProjectStore((state) => state.nodes)
  
  return useMemo(() => {
    return Object.values(nodes).filter(
      (n): n is TableNode => n.kind === 'source_table' || n.kind === 'derived_table'
    )
  }, [nodes])
}

/**
 * Hook to get all chart nodes from the project
 */
export function useChartNodes(): ChartNode[] {
  const nodes = useProjectStore((state) => state.nodes)
  
  return useMemo(() => {
    return Object.values(nodes).filter(
      (n): n is ChartNode => n.kind === 'chart'
    )
  }, [nodes])
}

/**
 * Hook to load profiles for all tables
 */
export function useAllProfiles() {
  const tableNodes = useTableNodes()
  const profiles = useProfilingStore((state) => state.profiles)
  const loading = useProfilingStore((state) => state.loading)

  // Trigger profile loading for tables that don't have profiles
  useEffect(() => {
    for (const table of tableNodes) {
      if (!profiles[table.id] && !loading[table.id]) {
        loadProfileForTable(table.id)
      }
    }
  }, [tableNodes, profiles, loading])

  const isLoading = useMemo(() => {
    // Loading if any table is actively loading OR any table is missing a profile
    return tableNodes.some(t => loading[t.id] || !profiles[t.id])
  }, [tableNodes, profiles, loading])

  return { profiles, isLoading }
}

/**
 * Hook to compute data quality metrics for all tables
 */
export function useDataQualityMetrics(): { 
  tableMetrics: TableQualityMetrics[]
  isLoading: boolean 
} {
  const tableNodes = useTableNodes()
  const { profiles, isLoading: profilesLoading } = useAllProfiles()
  const tableData = useDataStore((state) => state.tableData)

  const tableMetrics = useMemo(() => {
    return tableNodes.map((table): TableQualityMetrics => {
      const profile = profiles[table.id]
      const data = tableData[table.id]
      const rowCount = data?.rows?.length || table.schema?.rowCount || profile?.rowCount || 0
      const columnCount = table.schema?.columns?.length || 0
      const isLoading = !profile && profilesLoading
      
      const completeness = computeTableCompleteness(profile, rowCount)
      const issues = extractIssuesFromProfile(profile, table.schema)
      
      // Freshness: use createdAt for source tables, null for derived
      const importedAt = table.kind === 'source_table' ? table.createdAt : null
      const isStale = table.kind === 'source_table' ? isDataStale(importedAt) : false
      const freshnessLabel = table.kind === 'source_table' 
        ? `Imported ${formatRelativeTime(importedAt)}`
        : 'Derived'
      
      // Type breakdown
      const typeBreakdown = computeTypeBreakdown(table.schema)

      return {
        tableId: table.id,
        tableName: table.name,
        tableKind: table.kind as 'source_table' | 'derived_table',
        rowCount,
        columnCount,
        completeness,
        issueCount: issues.length,
        issues,
        isLoading,
        hasProfile: !!profile,
        importedAt,
        isStale,
        freshnessLabel,
        typeBreakdown,
      }
    })
  }, [tableNodes, profiles, tableData, profilesLoading])

  return { tableMetrics, isLoading: profilesLoading }
}

/**
 * Hook to compute overall project health metrics
 */
export function useProjectHealthMetrics(): ProjectHealthMetrics {
  const { tableMetrics, isLoading } = useDataQualityMetrics()
  const chartNodes = useChartNodes()

  return useMemo(() => {
    if (tableMetrics.length === 0) {
      return {
        overallCompleteness: 100,
        totalIssues: 0,
        tablesWithIssues: 0,
        totalTables: 0,
        totalRows: 0,
        totalColumns: 0,
        chartCount: chartNodes.length,
        isLoading,
      }
    }

    const tablesWithProfiles = tableMetrics.filter(t => t.hasProfile)
    const overallCompleteness = tablesWithProfiles.length > 0
      ? Math.round(tablesWithProfiles.reduce((sum, t) => sum + t.completeness, 0) / tablesWithProfiles.length)
      : 100

    const totalIssues = tableMetrics.reduce((sum, t) => sum + t.issueCount, 0)
    const tablesWithIssues = tableMetrics.filter(t => t.issueCount > 0).length
    const totalRows = tableMetrics.reduce((sum, t) => sum + t.rowCount, 0)
    const totalColumns = tableMetrics.reduce((sum, t) => sum + t.columnCount, 0)

    return {
      overallCompleteness,
      totalIssues,
      tablesWithIssues,
      totalTables: tableMetrics.length,
      totalRows,
      totalColumns,
      chartCount: chartNodes.length,
      isLoading,
    }
  }, [tableMetrics, chartNodes.length, isLoading])
}

/**
 * Hook to aggregate insights from all tables
 */
export function useAggregatedInsights(): { insights: Insight[]; isLoading: boolean } {
  const tableNodes = useTableNodes()
  const { profiles, isLoading } = useAllProfiles()
  const tableData = useDataStore((state) => state.tableData)

  const insights = useMemo(() => {
    const allInsights: Insight[] = []

    for (const table of tableNodes) {
      const profile = profiles[table.id]
      const data = tableData[table.id]
      const rowCount = data?.rows?.length || table.schema?.rowCount || profile?.rowCount || 0

      const tableInsights = extractInsightsFromProfile(
        table.id,
        table.name,
        profile,
        table.schema,
        rowCount
      )
      allInsights.push(...tableInsights)
    }

    // Sort by severity (warnings first, then info, then success) and limit to top 10
    const severityOrder = { warning: 0, info: 1, success: 2 }
    return allInsights
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      .slice(0, 10)
  }, [tableNodes, profiles, tableData])

  return { insights, isLoading }
}

/**
 * Hook to get top suggestions across all tables
 */
export function useTopSuggestions(limit: number = 5): { 
  suggestions: Array<Suggestion & { tableName: string }>
  isLoading: boolean 
} {
  const tableNodes = useTableNodes()
  const { profiles, isLoading } = useAllProfiles()
  const tableData = useDataStore((state) => state.tableData)

  const suggestions = useMemo(() => {
    const allSuggestions: Array<Suggestion & { tableName: string }> = []

    for (const table of tableNodes) {
      const profile = profiles[table.id]
      const data = tableData[table.id]
      
      if (!table.schema || !profile) continue

      const rowCount = data?.rows?.length || table.schema?.rowCount || profile?.rowCount || 0
      const versionHash = generateTableVersionHash(
        table.id,
        rowCount,
        table.schema.columns.length,
        undefined
      )

      try {
        const tableSuggestions = generateSuggestions({
          tableId: table.id,
          tableName: table.name,
          schema: table.schema,
          profile: {
            columns: profile.columns,
            rowCount: profile.rowCount,
          },
          tableVersionHash: versionHash,
        })

        // Add table name to each suggestion
        for (const suggestion of tableSuggestions) {
          allSuggestions.push({ ...suggestion, tableName: table.name })
        }
      } catch {
        // Suggestion generation failed for this table, skip
      }
    }

    // Sort by confidence (high first) and category priority
    const confidenceOrder = { high: 0, medium: 1, low: 2 }
    const categoryOrder = { cleaning: 0, analysis: 1, recipe: 2 }
    
    return allSuggestions
      .sort((a, b) => {
        const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
        if (confDiff !== 0) return confDiff
        return categoryOrder[a.category] - categoryOrder[b.category]
      })
      .slice(0, limit)
  }, [tableNodes, profiles, tableData, limit])

  return { suggestions, isLoading }
}

/**
 * Hook to get lineage data (nodes and edges for the mini map)
 * Includes tables AND charts to show full data flow
 */
export function useLineageData(): { 
  nodes: LineageNode[]
  edges: LineageEdge[]
} {
  const tableNodes = useTableNodes()
  const chartNodes = useChartNodes()
  const storeEdges = useProjectStore((state) => state.edges)
  const tableData = useDataStore((state) => state.tableData)

  return useMemo(() => {
    // Table nodes
    const tableLineageNodes: LineageNode[] = tableNodes.map(table => {
      const data = tableData[table.id]
      return {
        id: table.id,
        name: table.name,
        kind: table.kind as 'source_table' | 'derived_table',
        rowCount: data?.rows?.length || table.schema?.rowCount || 0,
      }
    })

    // Chart nodes
    const chartLineageNodes: LineageNode[] = chartNodes.map(chart => ({
      id: chart.id,
      name: chart.name || 'Chart',
      kind: 'chart' as const,
      rowCount: 0,
      chartType: chart.plan?.chartType || 'bar',
    }))

    const nodes = [...tableLineageNodes, ...chartLineageNodes]
    const nodeIds = new Set(nodes.map(n => n.id))

    // Get edges that connect any of our nodes (tables or charts)
    const edges: LineageEdge[] = Object.values(storeEdges)
      .filter(edge => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
      .map(edge => ({
        id: edge.id,
        from: edge.fromNodeId,
        to: edge.toNodeId,
      }))

    return { nodes, edges }
  }, [tableNodes, chartNodes, storeEdges, tableData])
}

/**
 * Utility hook to navigate to a table
 */
export function useNavigateToTable() {
  const selectNode = useProjectStore((state) => state.selectNode)
  
  return useCallback((tableId: string) => {
    selectNode(tableId)
    // The actual navigation to grid view is handled by the parent App component
    // through the onOpenTable callback
  }, [selectNode])
}
