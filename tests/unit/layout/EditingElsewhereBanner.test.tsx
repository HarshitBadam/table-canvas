import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeaseState } from '@/state/document/documentLease'
import { EditingElsewhereBanner } from '@/layout/EditingElsewhereBanner'

let leaseState: LeaseState = { role: 'owner' }
const listeners = new Set<() => void>()

vi.mock('@/state/document/useWorkspaceLease', () => ({
  useWorkspaceLease: () => ({
    ...leaseState,
    canEdit: leaseState.role === 'owner',
  }),
}))

vi.mock('@/state/document/documentLease', () => ({
  getLeaseState: () => leaseState,
  subscribeLease: (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}))

beforeEach(() => {
  leaseState = { role: 'owner' }
  listeners.clear()
})

describe('EditingElsewhereBanner', () => {
  it('shows nothing while editing happens here', () => {
    render(<EditingElsewhereBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a static read-only notice while mirroring', () => {
    leaseState = { role: 'mirror' }
    render(<EditingElsewhereBanner />)

    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-live', 'off')
    expect(banner).toHaveTextContent('Read-only · Editing in another tab')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never offers Edit here, takeover, or retry controls', () => {
    leaseState = { role: 'mirror' }
    render(<EditingElsewhereBanner />)

    for (const name of ['Edit here', 'Try again', 'Take over']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('never names the mechanism in user-facing copy', () => {
    leaseState = { role: 'mirror' }
    const { container } = render(<EditingElsewhereBanner />)

    const copy = container.textContent?.toLowerCase() ?? ''
    for (const word of ['lock', 'lease', 'mutex', 'owner']) {
      expect(copy).not.toContain(word)
    }
  })
})
