/**
 * Dashboard Component
 * Drag-and-drop layout for charts and KPIs
 */

import { useState, useRef, useMemo } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import { ChartRenderer } from '@/charts/ChartRenderer'
import type { ChartNode, DashboardCard, CellValue, TableNode, ProjectNode } from '@/lib/types'

interface DashboardProps {
  dashboardId?: string // Reserved for future use
}

// Default grid settings
const GRID_COLS = 12
const ROW_HEIGHT = 100
const GAP = 16

export function Dashboard({ dashboardId: _dashboardId }: DashboardProps) {
  const nodes = useProjectStore((state) => state.nodes)
  const tableData = useDataStore((state) => state.tableData)
  const [cards, setCards] = useState<DashboardCard[]>([])
  const [isAddingChart, setIsAddingChart] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Get all chart nodes
  const allNodes = Object.values(nodes) as ProjectNode[]
  const chartNodes = allNodes.filter(
    (n): n is ChartNode => n.kind === 'chart'
  )
  
  // Get all table nodes
  const tableNodes = allNodes.filter(
    (n): n is TableNode => n.kind === 'source_table' || n.kind === 'derived_table'
  )
  
  // Calculate dashboard statistics
  const stats = useMemo(() => {
    let totalRows = 0
    let totalColumns = 0
    
    tableNodes.forEach(table => {
      const data = tableData[table.id]
      totalRows += data?.rows?.length || table.schema?.rowCount || 0
      totalColumns += table.schema?.columns?.length || 0
    })
    
    return {
      tableCount: tableNodes.length,
      chartCount: chartNodes.length,
      totalRows,
      totalColumns,
    }
  }, [tableNodes, chartNodes, tableData])
  
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

  const updateCardPosition = (cardId: string, updates: Partial<DashboardCard>) => {
    setCards(cards.map(c => c.id === cardId ? { ...c, ...updates } : c))
  }

  return (
    <div className="h-full flex flex-col bg-canvas">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Dashboard</h2>
          <p className="text-xs text-text-tertiary">{cards.length} charts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsAddingChart(true)}
            className="btn btn-secondary gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Chart
          </button>
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

      {/* Dashboard Grid */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-6 print:p-0 print:overflow-visible"
      >
        {/* Stats Overview - Always visible */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Tables"
            value={stats.tableCount}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            }
            color="blue"
          />
          <StatCard
            title="Total Rows"
            value={stats.totalRows.toLocaleString()}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            }
            color="green"
          />
          <StatCard
            title="Total Columns"
            value={stats.totalColumns}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            }
            color="purple"
          />
          <StatCard
            title="Charts"
            value={stats.chartCount}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            color="orange"
          />
        </div>

        {/* Tables Overview */}
        {tableNodes.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Tables Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tableNodes.map(table => {
                const data = tableData[table.id]
                const rowCount = data?.rows?.length || table.schema?.rowCount || 0
                const colCount = table.schema?.columns?.length || 0
                
                return (
                  <div 
                    key={table.id}
                    className="p-4 bg-surface rounded-xl border border-border hover:border-accent-green/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          table.kind === 'source_table' ? 'bg-node-source text-node-source-border' : 'bg-node-derived text-node-derived-border'
                        }`}>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm2 0h14v4H5V5zm0 6h4v8H5v-8zm6 0h8v8h-8v-8z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-text-primary">{table.name}</h4>
                          <p className="text-xs text-text-tertiary capitalize">{table.kind.replace('_', ' ')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-text-secondary">
                      <span>{rowCount.toLocaleString()} rows</span>
                      <span>{colCount} columns</span>
                    </div>
                    {table.schema?.columns && table.schema.columns.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {table.schema.columns.slice(0, 4).map(col => (
                          <span key={col.id} className="px-2 py-0.5 text-xs bg-surface-secondary rounded text-text-tertiary">
                            {col.name}
                          </span>
                        ))}
                        {table.schema.columns.length > 4 && (
                          <span className="px-2 py-0.5 text-xs bg-surface-secondary rounded text-text-tertiary">
                            +{table.schema.columns.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Charts Section */}
        {cards.length === 0 && tableNodes.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-secondary flex items-center justify-center">
                <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                No Data Yet
              </h3>
              <p className="text-sm text-text-secondary mb-4 max-w-sm">
                Import some data or create a new table to see your dashboard come to life.
              </p>
            </div>
          </div>
        ) : cards.length === 0 && chartNodes.length > 0 ? (
          <div className="mt-4 p-4 bg-surface-secondary rounded-xl text-center">
            <p className="text-sm text-text-secondary mb-3">
              You have {chartNodes.length} chart{chartNodes.length > 1 ? 's' : ''} available. Add them to your dashboard!
            </p>
            <button
              onClick={() => setIsAddingChart(true)}
              className="btn btn-primary"
            >
              Add Charts to Dashboard
            </button>
          </div>
        ) : cards.length > 0 ? (
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
                  onRemove={() => removeCard(card.id)}
                  onUpdate={(updates) => updateCardPosition(card.id, updates)}
                />
              )
            })}
          </div>
        ) : null}
      </div>

      {/* Add Chart Modal */}
      {isAddingChart && (
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
                      onClick={() => !isAdded && addChartToDashboard(chart.id)}
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
                onClick={() => setIsAddingChart(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Dashboard Card Component
function DashboardCardComponent({
  card,
  chartNode,
  data,
  onRemove,
  onUpdate: _onUpdate,
}: {
  card: DashboardCard
  chartNode: ChartNode
  data: Record<string, CellValue>[]
  onRemove: () => void
  onUpdate: (updates: Partial<DashboardCard>) => void
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
        <div className="flex gap-1">
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-surface-secondary text-text-tertiary hover:text-text-primary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
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

// Stat Card Component
function StatCard({ 
  title, 
  value, 
  icon,
  color 
}: { 
  title: string
  value: string | number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'purple' | 'orange'
}) {
  const colorClasses = {
    blue: 'bg-accent-green/10 text-accent-green',
    green: 'bg-accent-green/10 text-accent-green',
    purple: 'bg-purple-500/10 text-purple-500',
    orange: 'bg-accent-orange/10 text-accent-orange',
  }
  
  return (
    <div className="p-4 bg-surface rounded-xl border border-border">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          <p className="text-xs text-text-tertiary">{title}</p>
        </div>
      </div>
    </div>
  )
}

// Chart Icon Component
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

