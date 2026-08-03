import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReportTableCells } from '@/report/editor/nodes/tables/useReportTableCells'

/**
 * The grid stops editing keys from reaching the document. Undo is the
 * exception: it acts on the document, so it must leave the table.
 */
let escaped: KeyboardEvent[]
const collect = (event: Event) => escaped.push(event as KeyboardEvent)

beforeEach(() => {
  escaped = []
  window.addEventListener('keydown', collect)
})

afterEach(() => {
  window.removeEventListener('keydown', collect)
  document.body.innerHTML = ''
})

function mountGridWithSelectedCell() {
  const view = renderHook(() => useReportTableCells({
    headers: ['Name', 'Value'],
    rows: [['Ada', '10']],
    updateAttributes: vi.fn(),
  }))

  const table = document.createElement('table')
  const cell = document.createElement('td')
  table.appendChild(cell)
  document.body.appendChild(table)
  view.result.current.gridRef.current = table

  // Selecting re-runs the listener effect that binds keydown to the table.
  act(() => view.result.current.selectCell({ row: 0, col: 0 }))

  return { view, cell }
}

function press(target: HTMLElement, init: KeyboardEventInit) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

describe('useReportTableCells keyboard containment', () => {
  it('lets undo and redo out of the table so the document can act on them', () => {
    const { cell } = mountGridWithSelectedCell()

    press(cell, { key: 'z', metaKey: true })
    press(cell, { key: 'Z', metaKey: true, shiftKey: true })
    press(cell, { key: 'y', ctrlKey: true })

    expect(escaped.map((event) => event.key)).toEqual(['z', 'Z', 'y'])
    expect(escaped.every((event) => !event.defaultPrevented)).toBe(true)
  })

  it('still keeps editing keys inside the table', () => {
    const { cell } = mountGridWithSelectedCell()

    for (const key of ['ArrowDown', 'Enter', 'Backspace', 'a']) {
      press(cell, { key })
    }

    expect(escaped).toEqual([])
  })

  it('keeps undo inside an open cell editor, where the field owns it', () => {
    const { view, cell } = mountGridWithSelectedCell()

    act(() => view.result.current.beginEdit({ row: 0, col: 0 }))
    press(cell, { key: 'z', metaKey: true })

    expect(escaped).toEqual([])
  })
})
