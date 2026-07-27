import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeaseState } from '@/state/documentLease'
import { EditingElsewhereBanner } from './EditingElsewhereBanner'

const requestWriteLease = vi.fn()
let leaseState: LeaseState = { role: 'owner', requesting: false, refused: false }
const listeners = new Set<() => void>()

function setLeaseState(next: Partial<LeaseState>): void {
  leaseState = { ...leaseState, ...next }
  act(() => {
    for (const listener of listeners) listener()
  })
}

vi.mock('@/state/documentLease', () => ({
  getLeaseState: () => leaseState,
  subscribeLease: (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  requestWriteLease: () => requestWriteLease(),
}))

beforeEach(() => {
  leaseState = { role: 'owner', requesting: false, refused: false }
  listeners.clear()
  requestWriteLease.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EditingElsewhereBanner', () => {
  it('shows nothing while editing happens here', () => {
    render(<EditingElsewhereBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('offers to move editing here while mirroring', () => {
    leaseState = { role: 'mirror', requesting: false, refused: false }
    render(<EditingElsewhereBanner />)

    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-live', 'polite')
    expect(banner).toHaveTextContent('Viewing live. Editing is active in another tab.')

    fireEvent.click(screen.getByRole('button', { name: 'Edit here' }))
    expect(requestWriteLease).toHaveBeenCalledTimes(1)
  })

  it('stays quiet for a handover that finishes quickly', () => {
    vi.useFakeTimers()
    leaseState = { role: 'mirror', requesting: false, refused: false }
    render(<EditingElsewhereBanner />)

    setLeaseState({ requesting: true })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Viewing live.')

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Moving editing to this tab…')
  })

  it('explains a refused handover and offers to retry', () => {
    leaseState = { role: 'mirror', requesting: false, refused: true }
    render(<EditingElsewhereBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'The other tab could not save its changes, so editing stayed there.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(requestWriteLease).toHaveBeenCalledTimes(1)
  })

  it('never names the mechanism in user-facing copy', () => {
    leaseState = { role: 'mirror', requesting: false, refused: false }
    const { container } = render(<EditingElsewhereBanner />)

    const copy = container.textContent?.toLowerCase() ?? ''
    for (const word of ['lock', 'lease', 'mutex', 'owner']) {
      expect(copy).not.toContain(word)
    }
  })
})
