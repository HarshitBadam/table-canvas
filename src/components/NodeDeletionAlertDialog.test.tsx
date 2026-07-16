import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addFilter, addSource, resetStore } from '@/engine/integrationTestUtils'
import { useCanvasKeyboard } from '@/canvas/useCanvasKeyboard'
import { NavigationProvider } from '@/layout/NavigationProvider'
import { Sidebar } from '@/layout/Sidebar'
import { AppContext, type AppContextValue } from '@/state/appContextValue'
import { useProjectStore } from '@/state/projectStore'
import { NodeDeletionProvider } from './NodeDeletionAlertDialog'

const deleteNodeWithSync = vi.fn().mockResolvedValue(undefined)
const appValue = {
  deleteNodeWithSync,
  projectLimitViolation: null,
  setProjectLimitViolation: vi.fn(),
  isSaving: false,
} as unknown as AppContextValue

function Providers({ children }: { children: ReactNode }) {
  return (
    <AppContext.Provider value={appValue}>
      <NavigationProvider value={{
        openTable: vi.fn(),
        openChart: vi.fn(),
        openCanvas: vi.fn(),
        openDashboard: vi.fn(),
        openReport: vi.fn(),
      }}>
        <NodeDeletionProvider>{children}</NodeDeletionProvider>
      </NavigationProvider>
    </AppContext.Provider>
  )
}

function KeyboardHarness() {
  useCanvasKeyboard()
  return <div>Canvas</div>
}

describe('shared node deletion alert dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    const tableId = addSource('Sales')
    useProjectStore.getState().selectNode(tableId)
  })

  it('opens the shared portal dialog from the sidebar and restores focus on cancel', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<Providers><Sidebar /></Providers>)

    const actions = screen.getByRole('button', { name: 'Actions for Sales' })
    fireEvent.click(actions)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Delete node?' })
    expect(dialog.closest('aside')).toBeNull()
    expect(screen.getByText(/removes the node from the workflow/i)).toBeVisible()
    expect(screen.getByText(/undo this change from the toolbar/i)).toBeVisible()
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(cancel).toHaveFocus())
    fireEvent.click(cancel)
    await waitFor(() => expect(actions).toHaveFocus())
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('opens the same dialog from the canvas keyboard without duplicate prompts', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<Providers><KeyboardHarness /></Providers>)

    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.getAllByRole('alertdialog', { name: 'Delete node?' })).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.getAllByRole('alertdialog', { name: 'Delete node?' })).toHaveLength(1)
    expect(confirmSpy).not.toHaveBeenCalled()

    fireEvent.keyDown(document.activeElement ?? window, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog', { name: 'Delete node?' })).not.toBeInTheDocument()
  })

  it('preserves the dependent-node warning while explaining undo', async () => {
    const sourceId = useProjectStore.getState().selectedNodeId!
    addFilter(sourceId, 'Filtered Sales')
    render(<Providers><Sidebar /></Providers>)

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Sales' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Delete node?' })
    expect(within(dialog).getByText(/also deletes 1 dependent node/i)).toBeVisible()
    expect(within(dialog).getByText(/undo this change from the toolbar/i)).toBeVisible()
  })
})
