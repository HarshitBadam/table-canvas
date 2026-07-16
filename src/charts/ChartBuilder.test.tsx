import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addSource, resetStore } from '@/engine/integrationTestUtils'
import { useProjectStore } from '@/state/projectStore'
import { ChartBuilder } from './ChartBuilder'

describe('ChartBuilder', () => {
  let tableId: string

  beforeEach(() => {
    resetStore()
    tableId = addSource('Sales')
  })

  it('uses keyboard-focusable native radio groups and linear field mapping', () => {
    render(<ChartBuilder isOpen sourceTableId={tableId} onClose={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Chart type' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Aggregation' })).toBeVisible()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    const bar = screen.getByRole('radio', { name: 'Bar' })
    const line = screen.getByRole('radio', { name: 'Line' })
    expect(bar).toBeChecked()
    expect(bar).toHaveAttribute('name', 'chart-type')

    line.focus()
    expect(line).toHaveFocus()
    fireEvent.click(line)
    expect(line).toBeChecked()

    expect(screen.getByLabelText(/Category · text or date/i)).toBeInstanceOf(HTMLSelectElement)
    expect(screen.getByLabelText(/Y axis · numeric/i)).toBeInstanceOf(HTMLSelectElement)

    const average = screen.getByRole('radio', { name: 'Average' })
    fireEvent.click(average)
    expect(average).toBeChecked()
    expect(screen.getByText('Chart name').parentElement).not.toHaveClass('hidden')
  })

  it('explains how to continue when no numeric columns are available', () => {
    const source = useProjectStore.getState().nodes[tableId]
    if (source.kind !== 'source_table') throw new Error('Expected source table')
    useProjectStore.setState({
      nodes: {
        ...useProjectStore.getState().nodes,
        [tableId]: {
          ...source,
          schema: {
            ...source.schema!,
            columns: source.schema!.columns.map((column) => ({ ...column, type: 'string' as const })),
          },
        },
      },
    })

    render(<ChartBuilder isOpen sourceTableId={tableId} onClose={vi.fn()} />)

    expect(screen.getByText(/No numeric columns are available/i)).toBeVisible()
    expect(screen.getByLabelText(/Y axis · numeric/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create Chart' })).toBeDisabled()
  })
})
