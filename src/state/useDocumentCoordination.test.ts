import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeaseState } from './documentLease'

const lease = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    state: {
      role: 'owner',
      requesting: false,
      refused: false,
      unreachable: false,
    } as LeaseState,
    listeners,
    set(next: Partial<LeaseState>) {
      lease.state = { ...lease.state, ...next }
      for (const listener of listeners) listener()
    },
    requestWriteLease: vi.fn(),
    startDocumentLease: vi.fn(() => () => {}),
    holdsWriteLease: vi.fn(() => true),
  }
})

vi.mock('./documentLease', () => ({
  getLeaseState: () => lease.state,
  holdsWriteLease: lease.holdsWriteLease,
  requestWriteLease: lease.requestWriteLease,
  startDocumentLease: lease.startDocumentLease,
  subscribeLease: (listener: () => void) => {
    lease.listeners.add(listener)
    return () => lease.listeners.delete(listener)
  },
}))
vi.mock('./documentMirror', () => ({
  applyDocumentSnapshot: vi.fn(),
  startDocumentMirror: vi.fn(() => () => {}),
}))
vi.mock('./transientProjectState', () => ({ setDocumentWriteGuard: vi.fn() }))
vi.mock('@/persistence/db', () => ({ loadProject: vi.fn().mockResolvedValue(null) }))
vi.mock('@/persistence/patchSerialization', () => ({ deserializePatches: vi.fn(() => ({})) }))
vi.mock('@/persistence/reportStorage', () => ({
  loadReportsForProject: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/report/reportStore', () => ({
  useReportStore: { getState: () => ({ flushSaves: vi.fn() }) },
}))

import { useDocumentCoordination } from './useDocumentCoordination'

const IDENTITY = { scope: 'guest', projectId: 'project-1', key: 'guest\u001fproject-1' }

function mount() {
  return renderHook(() => useDocumentCoordination({
    identity: IDENTITY,
    flush: async () => {},
  }))
}

function focusTab(focused: boolean) {
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused)
}

async function waitForHandoverWindow() {
  await act(async () => {
    vi.advanceTimersByTime(1_000)
  })
}

describe('editing follows the tab in front', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    lease.state = {
      role: 'owner',
      requesting: false,
      refused: false,
      unreachable: false,
    }
    lease.listeners.clear()
    lease.requestWriteLease.mockClear()
    focusTab(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('leaves editing alone while this tab already owns the document', async () => {
    mount()
    await waitForHandoverWindow()
    expect(lease.requestWriteLease).not.toHaveBeenCalled()
  })

  it('asks for editing when another tab takes the document from under it', async () => {
    mount()
    act(() => lease.set({ role: 'mirror' }))
    await waitForHandoverWindow()
    expect(lease.requestWriteLease).toHaveBeenCalledTimes(1)
  })

  it('leaves editing where it is while this tab is in the background', async () => {
    focusTab(false)
    mount()
    act(() => lease.set({ role: 'mirror' }))
    await waitForHandoverWindow()
    expect(lease.requestWriteLease).not.toHaveBeenCalled()
  })

  it('waits for the reader once the other tab has refused to hand over', async () => {
    mount()
    act(() => lease.set({ role: 'mirror', refused: true }))
    await waitForHandoverWindow()
    expect(lease.requestWriteLease).not.toHaveBeenCalled()
  })

  it('waits for the reader once the other tab is unreachable', async () => {
    mount()
    act(() => lease.set({ role: 'mirror', unreachable: true }))
    await waitForHandoverWindow()
    expect(lease.requestWriteLease).not.toHaveBeenCalled()
  })

  it('asks once when focus returns to a tab that is only mirroring', async () => {
    lease.state = {
      role: 'mirror',
      requesting: false,
      refused: false,
      unreachable: false,
    }
    mount()
    act(() => window.dispatchEvent(new Event('focus')))
    await waitForHandoverWindow()
    expect(lease.requestWriteLease).toHaveBeenCalledTimes(1)
  })

  it('stops asking after the hook is torn down', async () => {
    const { unmount } = mount()
    unmount()
    act(() => lease.set({ role: 'mirror' }))
    await waitForHandoverWindow()
    expect(lease.requestWriteLease).not.toHaveBeenCalled()
  })
})
