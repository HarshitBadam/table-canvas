import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AppProviderState } from '@/state/app-session/appContextValue'

const loadProjectWithSync = vi.hoisted(() => vi.fn())
const flushReportSaves = vi.hoisted(() => vi.fn())

vi.mock('@/persistence/sync/session/syncService', () => ({
  createProjectWithSync: vi.fn(),
  deleteProjectWithSync: vi.fn(),
  importProjectWithSync: vi.fn(),
  loadProjectWithSync,
}))
vi.mock('@/persistence/storage/local-db/reportStorage', () => ({
  deleteReportsForProject: vi.fn(),
  loadReportsForProject: vi.fn(),
  saveAllReports: vi.fn(),
}))
vi.mock('@/report/reportStore', () => ({
  useReportStore: {
    getState: () => ({ flushSaves: flushReportSaves }),
  },
}))
vi.mock('@/persistence/sync/project/projectCatalog', () => ({
  publishCatalogChanged: vi.fn(),
}))

import { useProjectActions } from '@/state/app-session/persistence/useProjectActions'
import {
  serializeProjectOperation,
} from '@/state/app-session/persistence/projectOperationSerializer'

function state(): AppProviderState {
  return {
    phase: 'ready',
    phaseMessage: 'Ready',
    engineReady: true,
    user: null,
    isAuthenticated: true,
    projectId: 'project-1',
    projectName: 'Project 1',
    projects: [],
    isSaving: false,
    isProjectOperationPending: false,
    error: null,
    syncError: null,
  }
}

describe('project action serialization', () => {
  it('waits for an existing shared project operation', async () => {
    let releaseBlocker!: () => void
    const blocker = serializeProjectOperation(() => new Promise<void>((resolve) => {
      releaseBlocker = resolve
    }))
    const flushProjectSave = vi.fn().mockResolvedValue(undefined)
    const prepareProject = vi.fn().mockResolvedValue(undefined)
    flushReportSaves.mockResolvedValue(undefined)
    loadProjectWithSync.mockResolvedValue({
      id: 'project-2',
      name: 'Project 2',
      nodes: {},
      edges: {},
      patches: {},
    })
    const { result } = renderHook(() => useProjectActions({
      state: state(),
      setState: vi.fn(),
      tier: 'guest',
      flushProjectSave,
      prepareProject,
      clearActiveWorkspace: vi.fn(),
      setProjectLimitViolation: vi.fn(),
    }))

    let action!: Promise<void>
    act(() => {
      action = result.current.loadProject('project-2')
    })
    await Promise.resolve()
    expect(flushProjectSave).not.toHaveBeenCalled()

    releaseBlocker()
    await blocker
    await act(async () => action)
    expect(flushProjectSave).toHaveBeenCalledOnce()
    expect(prepareProject).toHaveBeenCalledOnce()
  })
})
