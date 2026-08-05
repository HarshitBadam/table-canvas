import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lease = vi.hoisted(() => {
  let state = { role: 'acquiring' as 'acquiring' | 'owner' | 'mirror' }
  let active = true
  const listeners = new Set<() => void>()
  return {
    getLeaseState: () => state,
    hasDocumentLease: () => active,
    subscribeLease: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setRole: (role: 'acquiring' | 'owner' | 'mirror') => {
      state = { role }
      for (const listener of listeners) listener()
    },
    setActive: (next: boolean) => {
      active = next
      for (const listener of listeners) listener()
    },
  }
})

vi.mock('@/state/document/documentLease', () => ({
  getLeaseState: lease.getLeaseState,
  hasDocumentLease: lease.hasDocumentLease,
  subscribeLease: lease.subscribeLease,
}))

import { useWorkspaceLease } from '@/state/document/useWorkspaceLease'

describe('workspace lease controls', () => {
  beforeEach(() => {
    lease.setActive(true)
    lease.setRole('acquiring')
  })

  it('keeps controls read-only until ownership is granted', () => {
    const { result } = renderHook(() => useWorkspaceLease())

    expect(result.current).toEqual({ role: 'acquiring', canEdit: false })
    act(() => lease.setRole('owner'))
    expect(result.current).toEqual({ role: 'owner', canEdit: true })
    act(() => lease.setRole('mirror'))
    expect(result.current).toEqual({ role: 'mirror', canEdit: false })
  })

  it('keeps non-document controls available without a lease session', () => {
    lease.setActive(false)
    const { result } = renderHook(() => useWorkspaceLease())

    expect(result.current).toEqual({ role: 'acquiring', canEdit: true })
  })
})
