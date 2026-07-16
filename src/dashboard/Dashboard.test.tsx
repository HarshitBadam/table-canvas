import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addSource, resetStore } from '@/engine/integrationTestUtils'
import { NavigationProvider } from '@/layout/NavigationProvider'
import type { Suggestion } from '@/types'
import { Dashboard } from './Dashboard'

let suggestion: Suggestion

vi.mock('./useProjectHealthMetrics', () => ({
  useProjectHealthMetrics: () => ({ totalTables: 1, totalRows: 2, totalColumns: 2, overallCompleteness: 100 }),
}))
vi.mock('./useDataQualityMetrics', () => ({
  useDataQualityMetrics: () => ({ tableMetrics: [{}] }),
}))
vi.mock('./useTopSuggestions', () => ({
  useTopSuggestions: () => ({ suggestions: [suggestion], isLoading: false }),
}))
vi.mock('./useLineageData', () => ({
  useLineageData: () => ({ nodes: [], edges: [] }),
}))
vi.mock('./components/LineageMiniMap', () => ({ LineageMiniMap: () => null }))
vi.mock('./components/TableStatsSection', () => ({ TableStatsSection: () => null }))
vi.mock('./components/ColumnStatComponents', () => ({ CompletenessBar: () => null }))
vi.mock('./components/QuickActionsSection', () => ({
  QuickActionsSection: ({ suggestions, onApply }: {
    suggestions: Suggestion[]
    onApply: (value: Suggestion) => void
  }) => <button onClick={() => void onApply(suggestions[0])}>Apply chart suggestion</button>,
}))

describe('Dashboard suggestion navigation', () => {
  beforeEach(() => {
    resetStore()
    const tableId = addSource('Sales')
    suggestion = {
      id: 'dashboard-chart',
      category: 'analysis',
      scope: 'table',
      title: 'Sales by category',
      confidence: 'high',
      context: { tableId, tableVersionHash: 'version' },
      action: {
        kind: 'createChart',
        chart: {
          chartType: 'bar',
          sourceTableId: tableId,
          config: { xAxis: 'col1', yAxis: 'col2', aggregation: 'sum' },
        },
      },
    }
  })

  it('opens the actual chart view from the toast View action', async () => {
    const openChart = vi.fn()
    render(
      <NavigationProvider value={{
        openTable: vi.fn(),
        openChart,
        openCanvas: vi.fn(),
        openDashboard: vi.fn(),
        openReport: vi.fn(),
      }}>
        <Dashboard />
      </NavigationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apply chart suggestion' }))
    const viewAction = await screen.findByRole('button', { name: 'View' })
    fireEvent.click(viewAction)

    await waitFor(() => {
      expect(openChart).toHaveBeenCalledWith(expect.any(String))
    })
  })
})
