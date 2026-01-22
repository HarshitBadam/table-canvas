/**
 * Dashboard Component
 * 
 * Data Quality + Insights Hub
 * Surfaces data health, key findings, and actionable suggestions.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { ChartRenderer } from '@/charts/ChartRenderer'
import { applySuggestion, setToastHandler, type ToastNotification } from '@/suggestions/commands'
import type { ChartNode, DashboardCard, CellValue, Suggestion } from '@/lib/types'

// Import dashboard components
import { 
  HealthScoreHero,
  DataQualitySection,
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

// Default grid settings for charts
const GRID_COLS = 12
const ROW_HEIGHT = 100
const GAP = 16

export function Dashboard({ onOpenTable, onOpenSuggestions }: DashboardProps) {
  // Debug: Log when new Dashboard renders
  console.log('[Dashboard] New Data Health Dashboard v2 loaded')
  
  const nodes = useProjectStore((state) => state.nodes)
  const selectNode = useProjectStore((state) => state.selectNode)
  
  // Dashboard data hooks
  const healthMetrics = useProjectHealthMetrics()
  const { tableMetrics, isLoading: qualityLoading } = useDataQualityMetrics()
  const { insights, isLoading: insightsLoading } = useAggregatedInsights()
  const { suggestions, isLoading: suggestionsLoading } = useTopSuggestions(5)
  const lineageData = useLineageData()
  const chartNodes = useChartNodes()
  
  // Charts section state
  const [cards, setCards] = useState<DashboardCard[]>([])
  const [isAddingChart, setIsAddingChart] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  
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
      // Fallback: just open the table
      handleOpenTable(tableId)
    }
  }, [onOpenSuggestions, handleOpenTable])

  // Apply suggestion handler
  const handleApplySuggestion = useCallback(async (suggestion: Suggestion) => {
    await applySuggestion(suggestion)
  }, [])

  // Mock data for charts (in production would come from engine)
  const mockData: Record<string, CellValue>[] = [
    { category: 'A', value: 100 },
    { category: 'B', value: 200 },
    { category: 'C', value: 150 },
    { category: 'D', value: 300 },
    { category: 'E', value: 250 },
  ]

  const addChartToDashboard = (chartId: string) => {
    const newCard: DashboardCard = {
      id: `card-${Date.now()}`,
      nodeId: chartId,
      x: 0,
      y: cards.length > 0 ? Math.max(...cards.map(c => c.y + c.height)) : 0,
      width: 6,
      height: 3,
    }
    setCards([...cards, newCard])
    setIsAddingChart(false)
  }

  const removeCard = (cardId: string) => {
    setCards(cards.filter(c => c.id !== cardId))
  }

  // Check if we have any data at all
  const hasData = tableMetrics.length > 0
  const hasCharts = chartNodes.length > 0 || cards.length > 0

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Data Health Dashboard</h2>
          <p className="text-xs text-text-tertiary">Quality metrics, insights, and actions</p>
        </div>
        <div className="flex gap-2">
          {hasCharts && (
            <button
              onClick={() => setIsAddingChart(true)}
              className="btn btn-secondary gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Chart
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="btn btn-primary gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Dashboard Content */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-6 print:p-0 print:overflow-visible"
      >
        {!hasData ? (
          // Empty State
          <EmptyState />
        ) : (
          <>
            {/* Health Score Hero */}
            <HealthScoreHero metrics={healthMetrics} />

            {/* Two Column Layout for Quality + Insights */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              {/* Left Column: Data Quality */}
              <div>
                <DataQualitySection
                  tableMetrics={tableMetrics}
                  onOpenTable={handleOpenTable}
                  onOpenSuggestions={handleOpenSuggestions}
                />
              </div>

              {/* Right Column: Insights + Actions */}
              <div>
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
            </div>

            {/* Data Lineage */}
            <LineageMiniMap
              nodes={lineageData.nodes}
              edges={lineageData.edges}
              onNodeClick={handleOpenTable}
            />

            {/* Charts Section */}
            {hasCharts && (
              <ChartsSection
                cards={cards}
                chartNodes={chartNodes}
                nodes={nodes}
                mockData={mockData}
                onRemoveCard={removeCard}
                onAddChart={() => setIsAddingChart(true)}
              />
            )}
          </>
        )}
      </div>

      {/* Add Chart Modal */}
      {isAddingChart && (
        <AddChartModal
          chartNodes={chartNodes}
          cards={cards}
          onAdd={addChartToDashboard}
          onClose={() => setIsAddingChart(false)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast notification={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  )
}

// ============================================================================
// Empty State Component
// ============================================================================

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-surface-secondary flex items-center justify-center">
          <svg className="w-10 h-10 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-text-primary mb-2">
          No Data Yet
        </h3>
        <p className="text-sm text-text-secondary mb-6">
          Import some data to see your dashboard come to life. You'll get insights about data quality, 
          key findings, and actionable suggestions.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button className="btn btn-primary gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Data
          </button>
          <button className="btn btn-secondary gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Table
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Charts Section Component
// ============================================================================

function ChartsSection({
  cards,
  chartNodes,
  nodes,
  mockData,
  onRemoveCard,
  onAddChart,
}: {
  cards: DashboardCard[]
  chartNodes: ChartNode[]
  nodes: Record<string, unknown>
  mockData: Record<string, CellValue>[]
  onRemoveCard: (id: string) => void
  onAddChart: () => void
}) {
  if (cards.length === 0 && chartNodes.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Charts</h3>
        {chartNodes.length > cards.length && (
          <button
            onClick={onAddChart}
            className="text-xs text-accent-green hover:underline"
          >
            Add chart to dashboard
          </button>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="p-6 bg-surface rounded-xl border border-border text-center">
          <p className="text-sm text-text-secondary mb-3">
            You have {chartNodes.length} chart{chartNodes.length !== 1 ? 's' : ''} available.
          </p>
          <button
            onClick={onAddChart}
            className="btn btn-secondary btn-sm"
          >
            Add to Dashboard
          </button>
        </div>
      ) : (
        <div 
          className="relative print:block"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gap: GAP,
            minHeight: (Math.max(...cards.map(c => c.y + c.height)) + 1) * ROW_HEIGHT,
          }}
        >
          {cards.map((card) => {
            const chartNode = nodes[card.nodeId] as ChartNode | undefined
            if (!chartNode) return null

            return (
              <DashboardCardComponent
                key={card.id}
                card={card}
                chartNode={chartNode}
                data={mockData}
                onRemove={() => onRemoveCard(card.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Dashboard Card Component
// ============================================================================

function DashboardCardComponent({
  card,
  chartNode,
  data,
  onRemove,
}: {
  card: DashboardCard
  chartNode: ChartNode
  data: Record<string, CellValue>[]
  onRemove: () => void
}) {
  return (
    <div
      className="bg-surface rounded-xl shadow-md border border-border overflow-hidden print:shadow-none print:border print:break-inside-avoid"
      style={{
        gridColumn: `span ${card.width}`,
        gridRow: `span ${card.height}`,
      }}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border print:hidden">
        <span className="text-sm font-medium text-text-primary truncate">
          {chartNode.name}
        </span>
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block px-4 py-2 border-b border-border">
        <span className="text-sm font-semibold text-text-primary">
          {chartNode.name}
        </span>
      </div>

      {/* Chart */}
      <div className="p-4">
        <ChartRenderer
          type={chartNode.plan.chartType}
          config={chartNode.plan.config}
          data={data}
          height={card.height * ROW_HEIGHT - 80}
          showLegend={card.height >= 3}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Add Chart Modal
// ============================================================================

function AddChartModal({
  chartNodes,
  cards,
  onAdd,
  onClose,
}: {
  chartNodes: ChartNode[]
  cards: DashboardCard[]
  onAdd: (chartId: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6 animate-scale-in">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Add Chart to Dashboard
        </h3>
        
        {chartNodes.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No charts available. Create a chart from your data first.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {chartNodes.map((chart) => {
              const isAdded = cards.some(c => c.nodeId === chart.id)
              return (
                <button
                  key={chart.id}
                  onClick={() => !isAdded && onAdd(chart.id)}
                  disabled={isAdded}
                  className={`
                    w-full p-3 rounded-lg text-left transition-colors border
                    ${isAdded 
                      ? 'border-border bg-surface-secondary opacity-50 cursor-not-allowed'
                      : 'border-border hover:border-accent-green hover:bg-surface-secondary'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-node-chart flex items-center justify-center text-node-chart-border">
                      <ChartIcon type={chart.plan.chartType} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-text-primary">
                        {chart.name}
                      </div>
                      <div className="text-xs text-text-tertiary capitalize">
                        {chart.plan.chartType} chart
                      </div>
                    </div>
                    {isAdded && (
                      <span className="ml-auto text-xs text-text-tertiary">
                        Already added
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
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

// ============================================================================
// Chart Icon Component
// ============================================================================

function ChartIcon({ type }: { type: string }) {
  switch (type) {
    case 'bar':
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
        </svg>
      )
    case 'line':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 4 4 6-6" />
        </svg>
      )
    case 'pie':
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z" />
        </svg>
      )
    default:
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="7" cy="14" r="2" />
          <circle cx="11" cy="10" r="2" />
          <circle cx="15" cy="16" r="2" />
          <circle cx="17" cy="8" r="2" />
        </svg>
      )
  }
}
