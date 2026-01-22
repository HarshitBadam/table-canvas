/**
 * Dashboard Component
 * 
 * Project Overview - comprehensive view of workspace state.
 * Clear visual hierarchy with explicit sections.
 */

import { useState, useCallback, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { applySuggestion, setToastHandler, type ToastNotification } from '@/suggestions/commands'
import type { Suggestion } from '@/lib/types'

// Import dashboard components
import { 
  TablesListSection,
  DataHealthPanel,
  KeyInsightsSection,
  QuickActionsSection,
  LineageMiniMap,
} from './components'

// Import dashboard hooks
import {
  useProjectHealthMetrics,
  useDataQualityMetrics,
  useAggregatedInsights,
  useTopSuggestions,
  useLineageData,
  useChartNodes,
} from './useDashboardData'

interface DashboardProps {
  onOpenTable?: (tableId: string) => void
  onOpenSuggestions?: (tableId: string) => void
}

export function Dashboard({ onOpenTable, onOpenSuggestions }: DashboardProps) {
  const selectNode = useProjectStore((state) => state.selectNode)
  
  // Dashboard data hooks
  const healthMetrics = useProjectHealthMetrics()
  const { tableMetrics, isLoading: qualityLoading } = useDataQualityMetrics()
  const { insights, isLoading: insightsLoading } = useAggregatedInsights()
  const { suggestions, isLoading: suggestionsLoading } = useTopSuggestions(3) // Limit to 3
  const lineageData = useLineageData()
  const chartNodes = useChartNodes()
  
  // Toast notification state
  const [toast, setToast] = useState<ToastNotification | null>(null)
  
  // Set up toast handler
  useEffect(() => {
    setToastHandler((notification) => {
      setToast(notification)
      setTimeout(() => setToast(null), 4000)
    })
  }, [])

  // Navigation handlers
  const handleOpenTable = useCallback((tableId: string) => {
    if (onOpenTable) {
      onOpenTable(tableId)
    } else {
      selectNode(tableId)
    }
  }, [onOpenTable, selectNode])

  const handleOpenSuggestions = useCallback((tableId: string) => {
    if (onOpenSuggestions) {
      onOpenSuggestions(tableId)
    } else {
      handleOpenTable(tableId)
    }
  }, [onOpenSuggestions, handleOpenTable])

  // Apply suggestion handler
  const handleApplySuggestion = useCallback(async (suggestion: Suggestion) => {
    await applySuggestion(suggestion)
  }, [])

  // Check if we have any data at all
  const hasData = tableMetrics.length > 0
  const { totalTables, totalRows, totalColumns, chartCount } = healthMetrics

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* Header - Clean with inline stats */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Project Overview</h1>
          {hasData && (
            <div className="flex items-center gap-3 mt-1">
              <Stat icon={<TableIcon />} value={totalTables} label="Tables" />
              <span className="text-text-tertiary">·</span>
              <Stat icon={<RowsIcon />} value={formatNumber(totalRows)} label="Rows" />
              <span className="text-text-tertiary">·</span>
              <Stat icon={<ColumnsIcon />} value={totalColumns} label="Columns" />
              {chartCount > 0 && (
                <>
                  <span className="text-text-tertiary">·</span>
                  <Stat icon={<ChartIcon />} value={chartCount} label="Charts" />
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="btn btn-secondary gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export PDF
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 print:p-0 print:overflow-visible">
        {!hasData ? (
          <EmptyState />
        ) : (
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Top Row: Your Data + Data Health */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Tables List (takes 2 columns) */}
              <div className="lg:col-span-2">
                <TablesListSection
                  tableMetrics={tableMetrics}
                  onOpenTable={handleOpenTable}
                />
              </div>

              {/* Right: Data Health Panel */}
              <div>
                <DataHealthPanel
                  metrics={healthMetrics}
                  tableMetrics={tableMetrics}
                />
              </div>
            </div>

            {/* Middle Row: What We Found + What To Do Next */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <KeyInsightsSection
                insights={insights}
                onOpenTable={handleOpenTable}
                isLoading={insightsLoading}
              />
              
              <QuickActionsSection
                suggestions={suggestions}
                onApply={handleApplySuggestion}
                onOpenTable={handleOpenTable}
                isLoading={suggestionsLoading}
              />
            </div>

            {/* Bottom: Data Flow (Lineage) */}
            <LineageMiniMap
              nodes={lineageData.nodes}
              edges={lineageData.edges}
              onNodeClick={handleOpenTable}
            />
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

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text-secondary">
      <span className="text-text-tertiary">{icon}</span>
      <span className="font-medium text-text-primary">{value}</span>
      <span>{label}</span>
    </div>
  )
}

function TableIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function RowsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}

function ColumnsIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
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
