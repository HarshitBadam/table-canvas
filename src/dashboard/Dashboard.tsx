import { useState, useCallback, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { applySuggestion, setToastHandler, type ToastNotification } from '@/suggestions/commands'
import { Toast } from '@/suggestions/Toast'
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
    await applySuggestion(suggestion)
  }, [])

  const hasData = tableMetrics.length > 0
  const { totalTables, totalRows, totalColumns, overallCompleteness } = healthMetrics

  return (
    <div className="h-full flex flex-col bg-canvas">
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
              <CompletenessBar value={overallCompleteness} barWidth="w-12" barHeight="h-1" />
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {!hasData ? (
          <DashboardEmptyState />
        ) : (
          <div className="max-w-5xl mx-auto space-y-8 dashboard-container">
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

