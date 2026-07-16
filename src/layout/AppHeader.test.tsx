import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectExportState } from './useProjectExport'
import { AppHeader } from './AppHeader'

vi.mock('@/state/AppContext', () => ({
  useApp: () => ({ isSaving: false }),
  useAppAuth: () => ({ user: null, logout: vi.fn() }),
}))
vi.mock('./ProjectSwitcher', () => ({ ProjectSwitcher: () => <span>Project</span> }))

function HeaderHarness() {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null!)
  const importInputRef = useRef<HTMLInputElement>(null!)
  const exportState: ProjectExportState = {
    isExporting: false,
    isImporting: false,
    exportProgress: '',
    exportError: null,
    exportDropdownOpen: open,
    dropdownRef,
    importInputRef,
    handleExport: vi.fn().mockResolvedValue(undefined),
    handleImportClick: vi.fn(),
    handleImportFile: vi.fn().mockResolvedValue(undefined),
    setExportDropdownOpen: setOpen,
  }
  return (
    <AppHeader
      viewMode="canvas"
      selectedNode={null}
      exportState={exportState}
      onBackToCanvas={vi.fn()}
      onOpenNavigation={vi.fn()}
    />
  )
}

describe('AppHeader export menu modality', () => {
  it('keeps focus on the trigger when opened by pointer', async () => {
    render(<HeaderHarness />)
    const trigger = screen.getByRole('button', { name: 'Export' })
    trigger.focus()

    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger, { detail: 1 })

    expect(await screen.findByRole('menu', { name: 'Project actions' })).toBeVisible()
    expect(trigger).toHaveFocus()
  })

  it('moves keyboard focus into the menu and restores it on Escape', async () => {
    render(<HeaderHarness />)
    const trigger = screen.getByRole('button', { name: 'Export' })
    trigger.focus()

    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(trigger, { detail: 0 })

    const exportItem = await screen.findByRole('menuitem', { name: /Export Project/i })
    await waitFor(() => expect(exportItem).toHaveFocus())

    fireEvent.keyDown(exportItem, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: /Import Project/i })).toHaveFocus()

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
