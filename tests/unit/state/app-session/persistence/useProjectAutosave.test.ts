import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/state/projectStore'

const saveProjectWithSync = vi.hoisted(() => vi.fn())
const flushProjectSaveWithSync = vi.hoisted(() => vi.fn())
const holdsWriteLease = vi.hoisted(() => vi.fn())

vi.mock('@/persistence/sync/session/syncService', () => ({
  saveProjectWithSync,
  flushProjectSaveWithSync,
}))
vi.mock('@/state/document/documentLease', () => ({ holdsWriteLease }))
vi.mock('@/state/document/documentIdentity', () => ({
  activeDocumentIdentity: (projectId: string | null | undefined) => (
    projectId ? { projectId, scope: 'scope', key: `scope:${projectId}` } : null
  ),
}))
vi.mock('@/state/document/documentMirror', () => ({
  publishDocumentInvalidation: vi.fn(),
}))
vi.mock('@/report/reportStore', () => ({
  useReportStore: {
    getState: () => ({ reports: {} }),
  },
}))

import { useProjectAutosave } from '@/state/app-session/persistence/useProjectAutosave'

describe('project autosave ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveProjectWithSync.mockResolvedValue(undefined)
    flushProjectSaveWithSync.mockResolvedValue(undefined)
    useProjectStore.setState({
      projectId: 'project-new',
      projectName: 'New project',
      nodes: {},
      edges: {},
      patches: {},
      history: { past: [], future: [] },
    })
  })

  it('does not save a snapshot under another project lease', async () => {
    holdsWriteLease.mockImplementation((key: string) => key === 'scope:project-old')
    const { result } = renderHook(() => useProjectAutosave({
      phase: 'idle',
      isAuthenticated: true,
      projectId: 'project-new',
      setState: vi.fn(),
    }))

    await act(() => result.current.saveLatestProject())

    expect(holdsWriteLease).toHaveBeenCalledWith('scope:project-new')
    expect(saveProjectWithSync).not.toHaveBeenCalled()
  })

  it('saves when the snapshot and lease identities match', async () => {
    holdsWriteLease.mockImplementation((key: string) => key === 'scope:project-new')
    const { result } = renderHook(() => useProjectAutosave({
      phase: 'idle',
      isAuthenticated: true,
      projectId: 'project-new',
      setState: vi.fn(),
    }))

    await act(() => result.current.saveLatestProject())

    expect(saveProjectWithSync).toHaveBeenCalledWith(
      'project-new',
      'New project',
      {},
      {},
      {},
      {},
    )
  })
})
