import { useState, useCallback, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { applySuggestion, setToastHandler, type ToastNotification } from '@/suggestions/commands'
import { Toast } from '@/suggestions/Toast'
import { ImportButton } from '@/components/ImportButton'
import type { Suggestion } from '@/types'
import { formatNumber } from '@/lib/utils'
import { useNavigation } from '@/layout/NavigationContext'

import { LineageMiniMap } from './components/LineageMiniMap'
import { TableStatsSection } from './components/TableStatsSection'
import { QuickActionsSection } from './components/QuickActionsSection'
import { CompletenessBar } from './components/ColumnStatComponents'
import { useProjectHealthMetrics } from './useProjectHealthMetrics'
import { useDataQualityMetrics } from './useDataQualityMetrics'
import { useTopSuggestions } from './useTopSuggestions'
import { useLineageData } from './useLineageData'

export function Dashboard() {
  const { openTable, openChart } = useNavigation()
  const nodes = useProjectStore((state) => state.nodes)
  
  const healthMetrics = useProjectHealthMetrics()
  const { tableMetrics } = useDataQualityMetrics()
  const { suggestions, isLoading: suggestionsLoading } = useTopSuggestions(3)
  const lineageData = useLineageData()
  
  const [toast, setToast] = useState<ToastNotification | null>(null)
  
  useEffect(() => {
    setToastHandler((notification) => {
      setToast(notification)
      setTimeout(() => setToast(null), 4000)
    })
    return () => setToastHandler(null)
  }, [])

  const handleNodeClick = useCallback((nodeId: string) => {
    const node = nodes[nodeId]
    if (!node) return
    
    if (node.kind === 'chart') {
      openChart(nodeId)
    } else {
      openTable(nodeId)
    }
  }, [nodes, openTable, openChart])

  const handleApplySuggestion = useCallback(async (suggestion: Suggestion) => {
    const result = await applySuggestion(suggestion)
    if (!result.success) {
      setToast({ type: 'error', message: result.error || result.message })
    }
  }, [])

  const hasData = tableMetrics.length > 0
  const { totalTables, totalRows, totalColumns, overallCompleteness } = healthMetrics

  return (
    <div className="h-full flex flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-border bg-surface px-3 py-2.5 print:hidden sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="text-sm font-semibold text-text-primary">Project Overview</h1>
          {hasData && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className="hidden text-text-tertiary sm:inline">|</span>
              <Stat value={totalTables} label="Tables" />
              <span className="text-text-tertiary">·</span>
              <Stat value={formatNumber(totalRows)} label="Rows" />
              <span className="text-text-tertiary">·</span>
              <Stat value={totalColumns} label="Cols" />
              <span className="hidden text-text-tertiary sm:inline">·</span>
              <span className="hidden sm:inline-flex">
                <CompletenessBar value={overallCompleteness} barWidth="w-12" barHeight="h-1" />
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {!hasData ? (
          <DashboardEmptyState />
        ) : (
          <div className="max-w-5xl mx-auto space-y-5 sm:space-y-8 dashboard-container">
            <section className="lineage-section">
              <LineageMiniMap
                nodes={lineageData.nodes}
                edges={lineageData.edges}
                onNodeClick={handleNodeClick}
              />
            </section>

            <section>
              <TableStatsSection
                tableMetrics={tableMetrics}
              />
            </section>

            <section className="quick-actions-section">
              <QuickActionsSection
                suggestions={suggestions}
                onApply={handleApplySuggestion}
                isLoading={suggestionsLoading}
              />
            </section>
          </div>
        )}
      </div>

      {toast && (
        <Toast notification={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="text-text-secondary">
      <span className="font-medium text-text-primary">{value}</span> {label}
    </span>
  )
}


function DashboardEmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-md px-4 text-center">
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
        <div className="mx-auto w-40">
          <ImportButton />
        </div>
      </div>
    </div>
  )
}

