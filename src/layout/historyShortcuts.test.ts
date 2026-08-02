import { describe, expect, it } from 'vitest'
import {
  historyIntentFor,
  historyTargetFor,
  type HistoryContext,
  type HistoryKeyStroke,
} from './historyShortcuts'

function stroke(overrides: Partial<HistoryKeyStroke> = {}): HistoryKeyStroke {
  return { key: 'z', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides }
}

function context(overrides: Partial<HistoryContext> = {}): HistoryContext {
  return {
    view: 'canvas',
    inNativeTextField: false,
    inDialog: false,
    canEdit: true,
    ...overrides,
  }
}

describe('historyIntentFor', () => {
  it('reads undo from either platform modifier', () => {
    expect(historyIntentFor(stroke({ metaKey: true }))).toBe('undo')
    expect(historyIntentFor(stroke({ ctrlKey: true }))).toBe('undo')
  })

  it('reads redo from the shifted key the browser actually reports', () => {
    // Shift produces the uppercase character, which is the case the old
    // per-view handlers compared against `'z'` and therefore never matched.
    expect(historyIntentFor(stroke({ key: 'Z', metaKey: true, shiftKey: true }))).toBe('redo')
    expect(historyIntentFor(stroke({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo')
    expect(historyIntentFor(stroke({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('redo')
  })

  it('reads redo from Ctrl+Y', () => {
    expect(historyIntentFor(stroke({ key: 'y', ctrlKey: true }))).toBe('redo')
    expect(historyIntentFor(stroke({ key: 'Y', metaKey: true }))).toBe('redo')
  })

  it('ignores Shift+Y, which is not a redo shortcut', () => {
    expect(historyIntentFor(stroke({ key: 'Y', metaKey: true, shiftKey: true }))).toBeNull()
  })

  it('ignores the letters on their own', () => {
    expect(historyIntentFor(stroke({ key: 'z' }))).toBeNull()
    expect(historyIntentFor(stroke({ key: 'y' }))).toBeNull()
  })

  it('leaves Alt combinations to the keyboard layout', () => {
    expect(historyIntentFor(stroke({ metaKey: true, altKey: true }))).toBeNull()
    expect(historyIntentFor(stroke({ ctrlKey: true, altKey: true }))).toBeNull()
  })

  it('ignores unrelated shortcuts', () => {
    expect(historyIntentFor(stroke({ key: 's', metaKey: true }))).toBeNull()
    expect(historyIntentFor(stroke({ key: 'ArrowLeft', metaKey: true }))).toBeNull()
  })
})

describe('historyTargetFor', () => {
  it('leaves form fields to their own undo stack', () => {
    expect(historyTargetFor(context({ inNativeTextField: true }))).toBe('native')
  })

  it('prefers the form field over every other rule', () => {
    // A text input inside a modal still types, so its undo has to keep working.
    expect(
      historyTargetFor(context({ inNativeTextField: true, inDialog: true, canEdit: false })),
    ).toBe('native')
  })

  it('consumes the keystroke without acting while a modal is open', () => {
    expect(historyTargetFor(context({ inDialog: true }))).toBe('blocked')
    expect(historyTargetFor(context({ view: 'report', inDialog: true }))).toBe('blocked')
  })

  it('consumes the keystroke without acting when this tab cannot edit', () => {
    expect(historyTargetFor(context({ canEdit: false }))).toBe('blocked')
    expect(historyTargetFor(context({ view: 'report', canEdit: false }))).toBe('blocked')
  })

  it('routes the report view to the report document', () => {
    expect(historyTargetFor(context({ view: 'report' }))).toBe('report')
  })

  it('routes every other view to the project history', () => {
    for (const view of ['canvas', 'grid', 'chart', 'dashboard'] as const) {
      expect(historyTargetFor(context({ view }))).toBe('project')
    }
  })
})
