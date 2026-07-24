import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addSource, resetStore } from '@/engine/integrationTestUtils'
import { NavigationProvider } from '@/layout/NavigationProvider'
import { useProjectStore } from '@/state/projectStore'
import type { Suggestion } from '@/types'
import { SuggestionsPanel } from './SuggestionsPanel'

let panelState: ReturnType<typeof createPanelState>

vi.mock('./useSuggestionsPanel', () => ({
  useSuggestionsPanel: () => panelState,
}))

function chartSuggestion(id: string, tableId: string): Suggestion {
  return {
    id,
    category: 'analysis',
    scope: 'table',
    title: `Chart ${id}`,
    description: 'Compare values by category',
    why: ['The category repeats across rows'],
    confidence: 'high',
    context: { tableId, tableVersionHash: 'version' },
    preview: {
      status: 'ready',
      data: { kind: 'aggregateSample', columns: ['Category', 'Value'], rows: [['A', 10]] },
    },
    action: {
      kind: 'createChart',
      chart: {
        chartType: 'bar',
        sourceTableId: tableId,
        config: { xAxis: 'col1', yAxis: 'col2', aggregation: 'sum' },
      },
    },
  }
}

function createPanelState() {
  const node = Object.values(useProjectStore.getState().nodes)[0]
  const tableId = node.id
  return {
    node,
    filteredSuggestions: [chartSuggestion('one', tableId), chartSuggestion('two', tableId)],
    showLoading: false,
    activeCategory: 'all' as const,
    setActiveCategory: vi.fn(),
    categoryCounts: { all: 2, analysis: 2, cleaning: 0, recipe: 0 },
    isPhase2Loading: false,
    error: null,
    retry: vi.fn(),
    dismissedCount: 0,
    dismissSuggestion: vi.fn(),
    restoreDismissed: vi.fn(),
    setEffectiveCleaningCount: vi.fn(),
  }
}

describe('SuggestionsPanel list and navigation', () => {
  beforeEach(() => {
    resetStore()
    addSource('Sales')
    panelState = createPanelState()
  })

  function renderPanel(onClose = vi.fn(), openChart = vi.fn()) {
    return {
      onClose,
      openChart,
      ...render(
        <NavigationProvider value={{
          openTable: vi.fn(),
          openChart,
          openCanvas: vi.fn(),
          openDashboard: vi.fn(),
          openReport: vi.fn(),
        }}>
          <SuggestionsPanel isOpen onClose={onClose} tableId={panelState.node.id} />
        </NavigationProvider>,
      ),
    }
  }

  it('renders one divided semantic list with inline expanded detail', () => {
    renderPanel()

    const list = screen.getByRole('list', { name: 'Suggestions' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(list).toHaveClass('divide-y')
    expect(list).not.toHaveClass('border-y')
    expect(items[0]).not.toHaveClass('rounded-lg')
    expect(items[1]).not.toHaveClass('rounded-lg')

    fireEvent.click(screen.getByRole('button', { name: 'Chart one: Expand details' }))
    const detail = screen.getByRole('region', { name: /Chart one/i })
    expect(detail).toHaveClass('border-t')
    expect(within(detail).getByText('Preview')).toBeVisible()

    const rationale = within(detail).getByRole('button', { name: 'Why this suggestion?' })
    expect(rationale).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(rationale)
    expect(rationale).toHaveAttribute('aria-expanded', 'true')
    expect(within(detail).getByText('The category repeats across rows')).toBeVisible()
  })

  it('keeps toast View in the dialog Tab order and supports keyboard activation', async () => {
    const { openChart, onClose } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Chart one: Expand details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create chart' }))
    const view = await screen.findByRole('button', { name: 'View' })
    const dialog = screen.getByRole('dialog', { name: 'Suggestions' })
    expect(dialog).toContainElement(view)
    expect(view.tabIndex).toBe(0)
    view.focus()
    expect(view).toHaveFocus()
    fireEvent.click(view, { detail: 0 })

    await waitFor(() => expect(openChart).toHaveBeenCalledWith(expect.any(String)))
    expect(onClose).toHaveBeenCalled()
  })
})
