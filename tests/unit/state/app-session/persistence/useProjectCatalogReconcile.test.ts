import { act, renderHook, waitFor } from '@testing-library/react'
import type { SetStateAction } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppProviderState } from '@/state/app-session/appContextValue'
import type { ProjectCatalogEvent } from '@/persistence/sync/project/projectCatalog'

const sync = vi.hoisted(() => ({ fetchProjects: vi.fn() }))
const projectState = vi.hoisted(() => ({ projectId: 'project-1' }))
const catalog = vi.hoisted(() => ({
  listener: null as ((event: ProjectCatalogEvent) => void) | null,
  stopBinding: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('@/persistence/sync/session/syncService', () => sync)
vi.mock('@/persistence/storage/storageScope', () => ({
  getStorageScope: () => 'account:user-1',
}))
vi.mock('@/state/projectStore', () => ({
  useProjectStore: {
    getState: () => projectState,
  },
}))
vi.mock('@/persistence/sync/project/projectCatalog', () => ({
  bindProjectCatalog: vi.fn(() => catalog.stopBinding),
  subscribeProjectCatalog: vi.fn(
    (listener: (event: ProjectCatalogEvent) => void) => {
      catalog.listener = listener
      return catalog.unsubscribe
    },
  ),
}))

import { useProjectCatalogReconcile } from '@/state/app-session/persistence/useProjectCatalogReconcile'

function appState(): AppProviderState {
  return {
    phase: 'ready',
    phaseMessage: '',
    engineReady: true,
    user: null,
    isAuthenticated: true,
    projectId: 'project-1',
    projectName: 'Project 1',
    projects: [{
      id: 'project-1',
      name: 'Project 1',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }],
    isSaving: false,
    isProjectOperationPending: false,
    error: null,
    syncError: null,
  }
}

function renderReconcile() {
  let state = appState()
  const setState = vi.fn((update: SetStateAction<AppProviderState>) => {
    state = typeof update === 'function' ? update(state) : update
  })
  const clearActiveWorkspace = vi.fn().mockResolvedValue(undefined)
  renderHook(() => useProjectCatalogReconcile({
    isAuthenticated: true,
    phase: 'ready',
    engineReady: true,
    initialized: { current: true },
    clearActiveWorkspace,
    setState,
    userId: 'user-1',
  }))
  return {
    clearActiveWorkspace,
    getState: () => state,
  }
}

describe('project catalog reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    catalog.listener = null
    projectState.projectId = 'project-1'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  it('keeps the active workspace when a visibility fetch is empty', async () => {
    sync.fetchProjects.mockResolvedValue([])
    const view = renderReconcile()

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(sync.fetchProjects).toHaveBeenCalledOnce())
    expect(view.clearActiveWorkspace).not.toHaveBeenCalled()
    expect(view.getState().projectId).toBe('project-1')
    expect(view.getState().projects).toEqual(appState().projects)
  })

  it('keeps the active project in an incomplete catalog response', async () => {
    sync.fetchProjects.mockResolvedValue([{
      id: 'project-2',
      name: 'Project 2',
      createdAt: new Date(1),
      updatedAt: new Date(1),
    }])
    const view = renderReconcile()

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(view.clearActiveWorkspace).not.toHaveBeenCalled()
    expect(view.getState().projects.map(project => project.id)).toEqual([
      'project-1',
      'project-2',
    ])
  })

  it('clears the active workspace for an explicit deletion event', async () => {
    sync.fetchProjects.mockResolvedValue([])
    const view = renderReconcile()

    await act(async () => {
      catalog.listener?.({
        type: 'project-deleted',
        tabId: 'another-tab',
        projectId: 'project-1',
      })
    })

    await waitFor(() => expect(view.clearActiveWorkspace).toHaveBeenCalledOnce())
    expect(view.getState().projectId).toBeNull()
    expect(view.getState().projects).toEqual([])
  })
})
