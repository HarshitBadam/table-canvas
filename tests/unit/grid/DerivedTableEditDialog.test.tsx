import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NavigationProvider } from '@/layout/navigation/NavigationProvider'
import { DerivedTableEditDialog } from '@/grid/DerivedTableEditDialog'

const mocks = vi.hoisted(() => ({
  duplicateDerivedTable: vi.fn(),
}))

vi.mock('@/state/project/duplicateDerivedTable', () => ({
  duplicateDerivedTable: mocks.duplicateDerivedTable,
}))

vi.mock('@/state/AppContext', () => ({
  useAppAuth: () => ({ user: { tier: 'google' } }),
}))

vi.mock('@/components/UpgradePrompt', () => ({
  UpgradePrompt: () => null,
}))

function renderDialog(onClose = vi.fn(), openTable = vi.fn()) {
  render(
    <NavigationProvider value={{
      openTable,
      openChart: vi.fn(),
      openCanvas: vi.fn(),
      openDashboard: vi.fn(),
      openReport: vi.fn(),
    }}>
      <DerivedTableEditDialog isOpen tableId="derived-table" onClose={onClose} />
    </NavigationProvider>,
  )
  return { onClose, openTable }
}

describe('DerivedTableEditDialog', () => {
  it('renders a non-blocking bottom prompt and closes on outside click', () => {
    const { onClose } = renderDialog()

    expect(screen.getByRole('status').className).toContain('bottom-')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.pointerDown(document.body)

    expect(onClose).toHaveBeenCalledOnce()
    expect(mocks.duplicateDerivedTable).not.toHaveBeenCalled()
  })

  it('duplicates with the active user tier and opens the editable copy', async () => {
    mocks.duplicateDerivedTable.mockResolvedValueOnce({ ok: true, tableId: 'editable-copy' })
    const { onClose, openTable } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => {
      expect(mocks.duplicateDerivedTable).toHaveBeenCalledWith('derived-table', 'google')
    })
    expect(onClose).toHaveBeenCalledOnce()
    expect(openTable).toHaveBeenCalledWith('editable-copy')
  })

  it('keeps the dialog open when copying fails', async () => {
    mocks.duplicateDerivedTable.mockResolvedValueOnce({
      ok: false,
      code: 'WRITE_LEASE_LOST',
      error: 'Editing moved to another tab.',
    })
    const { onClose, openTable } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Editing moved to another tab.')
    expect(screen.getByText('Editing moved to another tab.')).toHaveClass('bottom-full')
    expect(onClose).not.toHaveBeenCalled()
    expect(openTable).not.toHaveBeenCalled()
  })
})
