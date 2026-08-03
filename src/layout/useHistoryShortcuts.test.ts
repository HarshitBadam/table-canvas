import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/state/projectStore'
import { useHistoryShortcuts } from './useHistoryShortcuts'
import type { ViewMode } from './viewNavigation'

const lease = { canEdit: true }
const editorCommands = { undo: vi.fn(), redo: vi.fn() }

vi.mock('@/state/useWorkspaceLease', () => ({
  useWorkspaceLease: () => lease,
}))

vi.mock('@/report/activeReportEditor', () => ({
  getActiveReportEditor: () => reportEditor,
}))

let reportEditor: { commands: typeof editorCommands } | null = null
let projectUndo = vi.fn<() => void>()
let projectRedo = vi.fn<() => void>()

beforeEach(() => {
  lease.canEdit = true
  reportEditor = { commands: editorCommands }
  editorCommands.undo.mockClear()
  editorCommands.redo.mockClear()
  projectUndo = vi.fn()
  projectRedo = vi.fn()
  useProjectStore.setState({ undo: projectUndo, redo: projectRedo })
})

afterEach(() => {
  document.body.innerHTML = ''
})

interface Keys {
  key?: string
  metaKey?: boolean
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

function press(view: ViewMode, keys: Keys, from?: HTMLElement): boolean {
  renderHook(() => useHistoryShortcuts(view))
  const event = new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true, ...keys })
  ;(from ?? document.body).dispatchEvent(event)
  return event.defaultPrevented
}

function focusable(tag: 'input' | 'textarea'): HTMLElement {
  const element = document.createElement(tag)
  document.body.appendChild(element)
  return element
}

describe('useHistoryShortcuts', () => {
  it('undoes the project from the views that show project data', () => {
    for (const view of ['canvas', 'grid', 'chart', 'dashboard'] as const) {
      projectUndo.mockClear()
      expect(press(view, { metaKey: true })).toBe(true)
      expect(projectUndo).toHaveBeenCalledTimes(1)
    }
  })

  it('redoes the project from the shifted keystroke the browser reports', () => {
    // The regression: Shift makes this arrive as `Z`, which the previous
    // per-view handler compared against `z` and never matched.
    expect(press('grid', { key: 'Z', metaKey: true, shiftKey: true })).toBe(true)
    expect(projectRedo).toHaveBeenCalledTimes(1)
    expect(projectUndo).not.toHaveBeenCalled()
  })

  it('redoes the project from Ctrl+Y', () => {
    expect(press('canvas', { key: 'y', ctrlKey: true })).toBe(true)
    expect(projectRedo).toHaveBeenCalledTimes(1)
  })

  it('sends undo on the report view to the report document, not the project', () => {
    expect(press('report', { metaKey: true })).toBe(true)
    expect(editorCommands.undo).toHaveBeenCalledTimes(1)
    expect(projectUndo).not.toHaveBeenCalled()
  })

  it('sends redo on the report view to the report document', () => {
    expect(press('report', { key: 'Z', metaKey: true, shiftKey: true })).toBe(true)
    expect(editorCommands.redo).toHaveBeenCalledTimes(1)
    expect(projectRedo).not.toHaveBeenCalled()
  })

  it('consumes undo on the report view even with no document open', () => {
    reportEditor = null
    expect(press('report', { metaKey: true })).toBe(true)
    expect(projectUndo).not.toHaveBeenCalled()
  })

  it('leaves form fields to their own undo stack', () => {
    for (const tag of ['input', 'textarea'] as const) {
      expect(press('grid', { metaKey: true }, focusable(tag))).toBe(false)
      expect(projectUndo).not.toHaveBeenCalled()
    }
  })

  it('consumes undo inside a modal without touching the workspace behind it', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const button = document.createElement('button')
    dialog.appendChild(button)
    document.body.appendChild(dialog)

    expect(press('canvas', { metaKey: true }, button)).toBe(true)
    expect(projectUndo).not.toHaveBeenCalled()
  })

  it('consumes undo but changes nothing while another tab holds editing', () => {
    lease.canEdit = false
    expect(press('grid', { metaKey: true })).toBe(true)
    expect(projectUndo).not.toHaveBeenCalled()
    expect(editorCommands.undo).not.toHaveBeenCalled()
  })

  it('defers to a handler that already claimed the keystroke', () => {
    renderHook(() => useHistoryShortcuts('report'))
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    event.preventDefault()
    document.body.dispatchEvent(event)

    expect(editorCommands.undo).not.toHaveBeenCalled()
    expect(projectUndo).not.toHaveBeenCalled()
  })

  it('ignores keystrokes that are not undo or redo', () => {
    expect(press('grid', { key: 's', metaKey: true })).toBe(false)
    expect(press('grid', { key: 'z' })).toBe(false)
    expect(press('grid', { metaKey: true, altKey: true })).toBe(false)
    expect(projectUndo).not.toHaveBeenCalled()
    expect(projectRedo).not.toHaveBeenCalled()
  })
})
