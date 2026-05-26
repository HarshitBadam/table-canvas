/**
 * Dashboard Component
 * 
 * Project Overview - comprehensive view of workspace state.
 * Data Flow hero at top, followed by Your Data and Suggested Actions.
 */

import { useState, useCallback, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { applySuggestion, setToastHandler, type ToastNotification } from '@/suggestions/commands'
import type { Suggestion } from '@/lib/types'

import { LineageMiniMap } from './components/LineageMiniMap'
import { TableStatsSection } from './components/TableStatsSection'
import { QuickActionsSection } from './components/QuickActionsSection'

// Import dashboard hooks
import {
  useProjectHealthMetrics,
  useDataQualityMetrics,
  useTopSuggestions,
  useLineageData,
} from './useDashboardData'

interface DashboardProps {
  onOpenTable?: (tableId: string) => void
  onOpenChart?: (chartId: string) => void
}

export function Dashboard({ onOpenTable, onOpenChart }: DashboardProps) {
  const selectNode = useProjectStore((state) => state.selectNode)
  const nodes = useProjectStore((state) => state.nodes)
  
  // Dashboard data hooks
  const healthMetrics = useProjectHealthMetrics()
  const { tableMetrics } = useDataQualityMetrics()
  const { suggestions, isLoading: suggestionsLoading } = useTopSuggestions(3)
  const lineageData = useLineageData()
  
  // Toast notification state
  const [toast, setToast] = useState<ToastNotification | null>(null)
  
  // Set up toast handler
  useEffect(() => {
    setToastHandler((notification) => {
      setToast(notification)
      setTimeout(() => setToast(null), 4000)
    })
  }, [])

  // Navigation handlers - detect if it's a table or chart
  const handleNodeClick = useCallback((nodeId: string) => {
    const node = nodes[nodeId]
    if (!node) return
    
    if (node.kind === 'chart') {
      if (onOpenChart) {
        onOpenChart(nodeId)
      } else {
        selectNode(nodeId)
      }
    } else {
      if (onOpenTable) {
        onOpenTable(nodeId)
      } else {
        selectNode(nodeId)
      }
    }
  }, [nodes, onOpenTable, onOpenChart, selectNode])

  // Direct table handler (for table-specific actions)
  const handleOpenTable = useCallback((tableId: string) => {
    if (onOpenTable) {
      onOpenTable(tableId)
    } else {
      selectNode(tableId)
    }
  }, [onOpenTable, selectNode])

  // Apply suggestion handler
  const handleApplySuggestion = useCallback(async (suggestion: Suggestion) => {
    await applySuggestion(suggestion)
  }, [])

  // Check if we have any data at all
  const hasData = tableMetrics.length > 0
  const { totalTables, totalRows, totalColumns, overallCompleteness } = healthMetrics

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* Header - Compact single line */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-surface print:hidden">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-text-primary">Project Overview</h1>
          {hasData && (
            <div className="flex items-center gap-2.5 text-xs text-text-secondary">
              <span className="text-text-tertiary">|</span>
              <Stat value={totalTables} label="Tables" />
              <span className="text-text-tertiary">·</span>
              <Stat value={formatNumber(totalRows)} label="Rows" />
              <span className="text-text-tertiary">·</span>
              <Stat value={totalColumns} label="Cols" />
              <span className="text-text-tertiary">·</span>
              <CompletenessIndicator completeness={overallCompleteness} />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {!hasData ? (
          <EmptyState />
        ) : (
          <div className="max-w-5xl mx-auto space-y-8 dashboard-container">
            {/* Data Flow - Hero Section (full width) */}
            <section className="lineage-section">
              <LineageMiniMap
                nodes={lineageData.nodes}
                edges={lineageData.edges}
                onNodeClick={handleNodeClick}
              />
            </section>

            {/* Your Data - Table Cards (full width) */}
            <section>
              <TableStatsSection
                tableMetrics={tableMetrics}
                onOpenTable={handleOpenTable}
              />
            </section>

            {/* Suggested Actions (full width) */}
            <section className="quick-actions-section">
              <QuickActionsSection
                suggestions={suggestions}
                onApply={handleApplySuggestion}
                onOpenTable={handleOpenTable}
                isLoading={suggestionsLoading}
              />
            </section>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <Toast notification={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  )
}

// ============================================================================
// Helper Components
// ============================================================================

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="text-text-secondary">
      <span className="font-medium text-text-primary">{value}</span> {label}
    </span>
  )
}

function CompletenessIndicator({ completeness }: { completeness: number }) {
  const isGood = completeness >= 95
  const isWarning = completeness >= 80 && completeness < 95
  
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full ${
            isGood ? 'bg-green-500' : isWarning ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${completeness}%` }}
        />
      </div>
      <span className={`font-medium ${
        isGood ? 'text-green-600 dark:text-green-400' : 
        isWarning ? 'text-amber-600 dark:text-amber-400' : 
        'text-red-600 dark:text-red-400'
      }`}>
        {completeness}%
      </span>
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toLocaleString()
}

// ============================================================================
// Empty State Component
// ============================================================================

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-surface-secondary flex items-center justify-center">
          <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          No Data Yet
        </h3>
        <p className="text-sm text-text-secondary mb-5">
          Import data to see your project overview with insights and suggestions.
        </p>
        <div className="flex gap-3 justify-center">
          <button className="btn btn-primary gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Data
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Toast Component
// ============================================================================

function Toast({ 
  notification, 
  onDismiss 
}: { 
  notification: ToastNotification
  onDismiss: () => void 
}) {
  const bgColor = notification.type === 'success' ? 'bg-green-600' :
                  notification.type === 'error' ? 'bg-red-600' : 'bg-blue-600'

  return (
    <div className={`fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-[100] flex items-center gap-3 animate-slide-up`}>
      <span className="text-sm">{notification.message}</span>
      {notification.action && (
        <button
          onClick={() => {
            notification.action?.onClick()
            onDismiss()
          }}
          className="text-sm font-medium underline hover:no-underline"
        >
          {notification.action.label}
        </button>
      )}
      <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
