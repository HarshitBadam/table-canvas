import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isNodeScopedView,
  readWorkspaceView,
  resolveWorkspaceView,
  workspaceViewStorageKey,
  writeWorkspaceView,
} from './workspaceViewPersistence'

const SCOPE = 'guest'
const PROJECT = 'project-1'

let stored: Map<string, string>

// The environment's own `localStorage` is a hollow object here, so these tests
// supply the storage they exercise rather than depending on the host's.
beforeEach(() => {
  stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  } satisfies Partial<Storage>)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('workspaceViewStorageKey', () => {
  it('separates the same project across storage scopes', () => {
    expect(workspaceViewStorageKey('guest', PROJECT))
      .not.toBe(workspaceViewStorageKey('account:user-1', PROJECT))
  })

  it('separates projects within a scope', () => {
    expect(workspaceViewStorageKey(SCOPE, 'a')).not.toBe(workspaceViewStorageKey(SCOPE, 'b'))
  })
})

describe('isNodeScopedView', () => {
  it('identifies the views that need a node to render', () => {
    expect(isNodeScopedView('grid')).toBe(true)
    expect(isNodeScopedView('chart')).toBe(true)
    expect(isNodeScopedView('canvas')).toBe(false)
    expect(isNodeScopedView('dashboard')).toBe(false)
    expect(isNodeScopedView('report')).toBe(false)
  })
})

describe('read/write round trip', () => {
  it('remembers a whole-screen view', () => {
    writeWorkspaceView(SCOPE, PROJECT, { view: 'report', nodeId: null })
    expect(readWorkspaceView(SCOPE, PROJECT)).toEqual({ view: 'report', nodeId: null })
  })

  it('remembers which node a node-scoped view was pointed at', () => {
    writeWorkspaceView(SCOPE, PROJECT, { view: 'grid', nodeId: 'table-1' })
    expect(readWorkspaceView(SCOPE, PROJECT)).toEqual({ view: 'grid', nodeId: 'table-1' })
  })

  it('drops a node id that the view would not use', () => {
    writeWorkspaceView(SCOPE, PROJECT, { view: 'dashboard', nodeId: 'table-1' })
    expect(readWorkspaceView(SCOPE, PROJECT)).toEqual({ view: 'dashboard', nodeId: null })
  })

  it('keeps scopes and projects independent', () => {
    writeWorkspaceView(SCOPE, PROJECT, { view: 'report', nodeId: null })
    writeWorkspaceView('account:user-1', PROJECT, { view: 'dashboard', nodeId: null })

    expect(readWorkspaceView(SCOPE, PROJECT)?.view).toBe('report')
    expect(readWorkspaceView('account:user-1', PROJECT)?.view).toBe('dashboard')
    expect(readWorkspaceView(SCOPE, 'other-project')).toBeNull()
  })

  it('overwrites the previous view rather than accumulating entries', () => {
    writeWorkspaceView(SCOPE, PROJECT, { view: 'report', nodeId: null })
    writeWorkspaceView(SCOPE, PROJECT, { view: 'chart', nodeId: 'chart-1' })
    expect(readWorkspaceView(SCOPE, PROJECT)).toEqual({ view: 'chart', nodeId: 'chart-1' })
  })
})

describe('readWorkspaceView with unusable data', () => {
  it('returns null when nothing was stored', () => {
    expect(readWorkspaceView(SCOPE, PROJECT)).toBeNull()
  })

  it('returns null for content that is not JSON', () => {
    stored.set(workspaceViewStorageKey(SCOPE, PROJECT), 'not json{')
    expect(readWorkspaceView(SCOPE, PROJECT)).toBeNull()
  })

  it('returns null for JSON that is not an object', () => {
    stored.set(workspaceViewStorageKey(SCOPE, PROJECT), '"report"')
    expect(readWorkspaceView(SCOPE, PROJECT)).toBeNull()
  })

  it('returns null for a view this build does not have', () => {
    stored.set(
      workspaceViewStorageKey(SCOPE, PROJECT),
      JSON.stringify({ view: 'timeline', nodeId: null }),
    )
    expect(readWorkspaceView(SCOPE, PROJECT)).toBeNull()
  })

  it('treats a non-string node id as no node', () => {
    stored.set(
      workspaceViewStorageKey(SCOPE, PROJECT),
      JSON.stringify({ view: 'grid', nodeId: 42 }),
    )
    expect(readWorkspaceView(SCOPE, PROJECT)).toEqual({ view: 'grid', nodeId: null })
  })
})

describe('unusable storage', () => {
  it('reads nothing and writes nothing when storage is missing', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readWorkspaceView(SCOPE, PROJECT)).toBeNull()
    expect(() => writeWorkspaceView(SCOPE, PROJECT, { view: 'report', nodeId: null })).not.toThrow()
  })

  it('ignores a storage object that has no methods on it', () => {
    vi.stubGlobal('localStorage', {})
    expect(readWorkspaceView(SCOPE, PROJECT)).toBeNull()
    expect(() => writeWorkspaceView(SCOPE, PROJECT, { view: 'report', nodeId: null })).not.toThrow()
  })

  it('survives a storage that rejects reads and writes', () => {
    const refuse = () => {
      throw new Error('storage is not available')
    }
    vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse })
    expect(readWorkspaceView(SCOPE, PROJECT)).toBeNull()
    expect(() => writeWorkspaceView(SCOPE, PROJECT, { view: 'report', nodeId: null })).not.toThrow()
  })
})

describe('resolveWorkspaceView', () => {
  const kinds: Record<string, string> = {
    'table-1': 'source_table',
    'derived-1': 'derived_table',
    'chart-1': 'chart',
  }
  const nodeKindOf = (id: string) => kinds[id]

  it('keeps a grid pointed at a table that still exists', () => {
    expect(resolveWorkspaceView({ view: 'grid', nodeId: 'table-1' }, nodeKindOf))
      .toEqual({ view: 'grid', nodeId: 'table-1' })
    expect(resolveWorkspaceView({ view: 'grid', nodeId: 'derived-1' }, nodeKindOf))
      .toEqual({ view: 'grid', nodeId: 'derived-1' })
  })

  it('keeps a chart pointed at a chart that still exists', () => {
    expect(resolveWorkspaceView({ view: 'chart', nodeId: 'chart-1' }, nodeKindOf))
      .toEqual({ view: 'chart', nodeId: 'chart-1' })
  })

  it('falls back to the canvas when the node is gone', () => {
    expect(resolveWorkspaceView({ view: 'grid', nodeId: 'deleted' }, nodeKindOf))
      .toEqual({ view: 'canvas', nodeId: null })
  })

  it('falls back to the canvas when the node is the wrong kind for the view', () => {
    expect(resolveWorkspaceView({ view: 'grid', nodeId: 'chart-1' }, nodeKindOf))
      .toEqual({ view: 'canvas', nodeId: null })
    expect(resolveWorkspaceView({ view: 'chart', nodeId: 'table-1' }, nodeKindOf))
      .toEqual({ view: 'canvas', nodeId: null })
  })

  it('falls back to the canvas when a node-scoped view has no node', () => {
    expect(resolveWorkspaceView({ view: 'chart', nodeId: null }, nodeKindOf))
      .toEqual({ view: 'canvas', nodeId: null })
  })

  it('restores whole-screen views without consulting nodes', () => {
    const never = () => {
      throw new Error('node lookup is not needed for a whole-screen view')
    }
    expect(resolveWorkspaceView({ view: 'report', nodeId: 'table-1' }, never))
      .toEqual({ view: 'report', nodeId: null })
    expect(resolveWorkspaceView({ view: 'dashboard', nodeId: null }, never))
      .toEqual({ view: 'dashboard', nodeId: null })
    expect(resolveWorkspaceView({ view: 'canvas', nodeId: null }, never))
      .toEqual({ view: 'canvas', nodeId: null })
  })
})
