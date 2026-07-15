import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ColumnSchema } from '@/types'
import { FormulaColumnModal } from './FormulaColumnModal'

const columns: ColumnSchema[] = [
  { id: 'id', name: 'ID', type: 'string', nullable: false },
  { id: 'value', name: 'Value', type: 'number', nullable: true },
]

describe('FormulaColumnModal', () => {
  it('blocks duplicate names with an accessible error', () => {
    const onConfirm = vi.fn()
    render(
      <FormulaColumnModal
        isOpen
        columns={columns}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Column Name'), { target: { value: ' value ' } })

    expect(screen.getByRole('alert')).toHaveTextContent('already exists')
    expect(screen.getByLabelText('Column Name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Add Column' })).toBeDisabled()
  })

  it('validates the current formula synchronously on submit', () => {
    const onConfirm = vi.fn()
    render(
      <FormulaColumnModal
        isOpen
        columns={columns}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Formula' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Formula' }), {
      target: { value: '[Value' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Column' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Unclosed column reference')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('reuses the formula editor for an existing computed column', () => {
    const computed: ColumnSchema = {
      id: 'total',
      name: 'Total',
      type: 'number',
      nullable: true,
      isComputed: true,
      formula: '[Value] * 2',
      canonicalFormula: '[value] * 2',
    }
    const onConfirm = vi.fn()
    render(
      <FormulaColumnModal
        isOpen
        columns={[...columns, computed]}
        initialColumn={computed}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Edit Formula' })).toBeVisible()
    expect(screen.getByLabelText('Column Name')).toBeDisabled()
    const formula = screen.getByRole('textbox', { name: 'Formula' })
    expect(formula).toHaveValue('[Value] * 2')
    fireEvent.change(formula, { target: { value: '[Value] > 10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Formula' }))

    expect(onConfirm).toHaveBeenCalledWith('Total', 'boolean', '[Value] > 10')
  })

  it('shows a state-level dependency error without closing', () => {
    const computed: ColumnSchema = {
      id: 'total',
      name: 'Total',
      type: 'number',
      nullable: true,
      isComputed: true,
      formula: '[Value] * 2',
    }
    render(
      <FormulaColumnModal
        isOpen
        columns={[...columns, computed]}
        initialColumn={computed}
        onConfirm={() => 'Formula for "Total" cannot reference itself.'}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Formula' }), {
      target: { value: '[Total] + 1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Formula' }))

    expect(screen.getByRole('alert')).toHaveTextContent('cannot reference itself')
  })
})
