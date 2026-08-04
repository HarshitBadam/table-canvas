import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const coordination = vi.hoisted(() => ({
  startDocumentLease: vi.fn(() => () => {}),
  startDocumentMirror: vi.fn(() => () => {}),
  stopLease: vi.fn(),
  stopMirror: vi.fn(),
}))

vi.mock('@/state/document/documentLease', () => ({
  holdsWriteLease: vi.fn(() => true),
  startDocumentLease: coordination.startDocumentLease,
}))
vi.mock('@/state/document/documentMirror', () => ({
  applyDocumentSnapshot: vi.fn(),
  startDocumentMirror: coordination.startDocumentMirror,
}))
vi.mock('@/state/document/transientProjectState', () => ({ setDocumentWriteGuard: vi.fn() }))
vi.mock('@/persistence/storage/local-db/db', () => ({ loadProject: vi.fn().mockResolvedValue(null) }))
vi.mock('@/persistence/storage/local-db/patchSerialization', () => ({ deserializePatches: vi.fn(() => ({})) }))
vi.mock('@/persistence/storage/local-db/reportStorage', () => ({
  loadReportsForProject: vi.fn().mockResolvedValue({}),
}))

import { useDocumentCoordination } from '@/state/document/useDocumentCoordination'

const IDENTITY = {
  scope: 'guest:tab-a',
  projectId: 'project-1',
  key: 'guest:tab-a\u001fproject-1',
}

describe('explicit document coordination', () => {
  beforeEach(() => {
    coordination.startDocumentLease.mockClear()
    coordination.startDocumentMirror.mockClear()
    coordination.stopLease.mockClear()
    coordination.stopMirror.mockClear()
    coordination.startDocumentLease.mockImplementation(() => coordination.stopLease)
    coordination.startDocumentMirror.mockImplementation(() => coordination.stopMirror)
  })

  it('binds the durable reader and write lease to the same identity', () => {
    const { unmount } = renderHook(() => useDocumentCoordination({
      identity: IDENTITY,
    }))

    expect(coordination.startDocumentMirror).toHaveBeenCalledWith(IDENTITY)
    expect(coordination.startDocumentLease).toHaveBeenCalledWith(
      expect.objectContaining({ key: IDENTITY.key }),
    )
    const leaseOptions = coordination.startDocumentLease.mock.calls.at(0)?.at(0) as {
      flush?: unknown
    } | undefined
    expect(leaseOptions).not.toHaveProperty('flush')
    unmount()
    expect(coordination.stopMirror).toHaveBeenCalledOnce()
    expect(coordination.stopLease).toHaveBeenCalledOnce()
  })

  it('never treats focus or visibility as editing intent', () => {
    renderHook(() => useDocumentCoordination({
      identity: IDENTITY,
    }))

    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(coordination.startDocumentLease).toHaveBeenCalledTimes(1)
  })
})
