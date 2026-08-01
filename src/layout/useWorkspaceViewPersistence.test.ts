import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/state/projectStore'
import { useWorkspaceViewPersistence } from './useWorkspaceViewPersistence'
import { readWorkspaceView, workspaceViewStorageKey } from './workspaceViewPersistence'
import type { ProjectNode } from '@/types'

vi.mock('@/persistence/storageScope', () => ({
  getStorageScope: () => 'guest',
}))

const PROJECT = 'project-1'

function tableNode(id: string): ProjectNode {
  return {
    id,
    kind: 'source_table',
    name: id,
    ui: { position: { x: 0, y: 0 } },
  } as unknown as ProjectNode
}

function loadProject(projectId: string, nodes: Record<string, ProjectNode> = {}) {
  useProjectStore.setState({ projectId, nodes, selectedNodeId: null })
}

let stored: Map<string, string>

beforeEach(() => {
  stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  } satisfies Partial<Storage>)
  loadProject(PROJECT)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function seed(projectId: string, view: string, nodeId: string | null) {
  stored.set(workspaceViewStorageKey('guest', projectId), JSON.stringify({ view, nodeId }))
}

describe('useWorkspaceViewPersistence', () => {
  it('opens the canvas when nothing has been remembered', () => {
    const { result } = renderHook(() => useWorkspaceViewPersistence())
    expect(result.current.activeView).toBe('canvas')
  })

  it('restores a remembered whole-screen view', () => {
    seed(PROJECT, 'report', null)
    const { result } = renderHook(() => useWorkspaceViewPersistence())
    expect(result.current.activeView).toBe('report')
  })

  it('does not overwrite the remembered view while restoring it', () => {
    // The first render defaults to the canvas, so a write that is not held back
    // until the restore lands would replace what is being read back.
    seed(PROJECT, 'report', null)
    renderHook(() => useWorkspaceViewPersistence())
    expect(readWorkspaceView('guest', PROJECT)).toEqual({ view: 'report', nodeId: null })
  })

  it('restores a node-scoped view together with its node', () => {
    loadProject(PROJECT, { 'table-1': tableNode('table-1') })
    seed(PROJECT, 'grid', 'table-1')

    const { result } = renderHook(() => useWorkspaceViewPersistence())

    expect(result.current.activeView).toBe('grid')
    expect(useProjectStore.getState().selectedNodeId).toBe('table-1')
    expect(readWorkspaceView('guest', PROJECT)).toEqual({ view: 'grid', nodeId: 'table-1' })
  })

  it('falls back to the canvas when the remembered node is gone', () => {
    seed(PROJECT, 'grid', 'deleted-table')

    const { result } = renderHook(() => useWorkspaceViewPersistence())

    expect(result.current.activeView).toBe('canvas')
    expect(useProjectStore.getState().selectedNodeId).toBeNull()
    expect(readWorkspaceView('guest', PROJECT)).toEqual({ view: 'canvas', nodeId: null })
  })

  it('remembers a deliberate navigation', () => {
    const { result } = renderHook(() => useWorkspaceViewPersistence())

    act(() => result.current.setActiveView('dashboard'))

    expect(result.current.activeView).toBe('dashboard')
    expect(readWorkspaceView('guest', PROJECT)).toEqual({ view: 'dashboard', nodeId: null })
  })

  it('shows the canvas for a node-scoped view whose node is not selected', () => {
    const { result } = renderHook(() => useWorkspaceViewPersistence())

    act(() => result.current.setActiveView('grid'))

    expect(result.current.activeView).toBe('canvas')
  })

  it('remembers each project separately and lands where each was left', () => {
    seed(PROJECT, 'report', null)
    seed('project-2', 'dashboard', null)

    const { result, rerender } = renderHook(() => useWorkspaceViewPersistence())
    expect(result.current.activeView).toBe('report')

    act(() => loadProject('project-2'))
    rerender()
    expect(result.current.activeView).toBe('dashboard')

    act(() => loadProject(PROJECT))
    rerender()
    expect(result.current.activeView).toBe('report')
  })

  it('keeps the remembered view of a project it has navigated away from', () => {
    seed(PROJECT, 'report', null)
    const { result, rerender } = renderHook(() => useWorkspaceViewPersistence())

    act(() => loadProject('project-2'))
    rerender()
    act(() => result.current.setActiveView('dashboard'))

    expect(readWorkspaceView('guest', PROJECT)).toEqual({ view: 'report', nodeId: null })
    expect(readWorkspaceView('guest', 'project-2')).toEqual({ view: 'dashboard', nodeId: null })
  })
})
