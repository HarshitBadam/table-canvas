import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscoveryTourProvider } from '@/discovery/DiscoveryTourProvider'
import { resetDiscoveryTourAccountCacheForTests } from '@/discovery/discoveryTourPersistence'
import { useDiscoveryTours } from '@/discovery/DiscoveryTourContext'
import type { User } from '@/api/auth.api'

const completeDiscoveryToursMock = vi.hoisted(() => vi.fn(
  async (completedTours: string[]) => ({ version: 1, completedTours }),
))

vi.mock('@/api/auth.api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/auth.api')>(),
  completeDiscoveryTours: completeDiscoveryToursMock,
}))

let stored: Map<string, string>

const GUEST_USER: User = {
  id: 'local-user',
  email: 'local@tablecanvas.app',
  name: 'Local User',
  tier: 'guest',
  discoveryTours: { version: 1, completedTours: [] },
  createdAt: new Date(0),
}

function ReplayButton() {
  const { replayAllTours } = useDiscoveryTours()
  return <button onClick={replayAllTours}>Replay</button>
}

async function startPendingTour() {
  await act(async () => {
    vi.advanceTimersByTime(500)
  })
}

describe('DiscoveryTourProvider', () => {
  beforeEach(() => {
    stored = new Map<string, string>()
    resetDiscoveryTourAccountCacheForTests()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    } satisfies Partial<Storage>)
    vi.useFakeTimers()
    completeDiscoveryToursMock.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('launches the canvas tour and advances through its steps', async () => {
    render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={GUEST_USER}>
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )

    await startPendingTour()

    expect(screen.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'Three ways to work' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not launch a completed tour after remounting', async () => {
    const first = render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={GUEST_USER}>
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    first.unmount()

    render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={GUEST_USER}>
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not relaunch the same tour when revisiting a view in one session', async () => {
    const view = render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={GUEST_USER}>
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    view.rerender(
      <DiscoveryTourProvider activeView="dashboard" projectId="project-1" user={GUEST_USER}>
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    view.rerender(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={GUEST_USER}>
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('allows completed tours to be replayed', async () => {
    render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={GUEST_USER}>
        <ReplayButton />
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await startPendingTour()

    expect(screen.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeInTheDocument()
  })

  it('uses server, guest, and pending completion for an account', async () => {
    stored.set(
      'table-canvas:discovery-tours:v1:guest-browser',
      JSON.stringify({ version: 1, completedTours: ['canvas'] }),
    )
    stored.set(
      'table-canvas:discovery-tours:v1:pending:account:account-1',
      JSON.stringify({ version: 1, completedTours: ['report'] }),
    )
    const onDiscoveryToursChange = vi.fn()
    const account: User = {
      ...GUEST_USER,
      id: 'account-1',
      tier: 'google',
      discoveryTours: { version: 1, completedTours: ['grid'] },
    }

    render(
      <DiscoveryTourProvider
        activeView="canvas"
        projectId="project-1"
        user={account}
        onDiscoveryToursChange={onDiscoveryToursChange}
      >
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    await act(async () => Promise.resolve())

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(completeDiscoveryToursMock).toHaveBeenCalledWith([
      'canvas',
      'report',
      'grid',
    ])
    expect(onDiscoveryToursChange).toHaveBeenCalledWith({
      version: 1,
      completedTours: ['canvas', 'report', 'grid'],
    })
  })

  it('replay does not erase durable guest completion', async () => {
    render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={GUEST_USER}>
        <ReplayButton />
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    const durableState = stored.get('table-canvas:discovery-tours:v1:guest-browser')

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await startPendingTour()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(stored.get('table-canvas:discovery-tours:v1:guest-browser'))
      .toBe(durableState)
  })

  it('keeps failed account completion pending and retries after remount', async () => {
    completeDiscoveryToursMock.mockRejectedValueOnce(new Error('offline'))
    const account: User = {
      ...GUEST_USER,
      id: 'account-1',
      tier: 'google',
      discoveryTours: { version: 1, completedTours: [] },
    }
    const first = render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={account}>
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    await act(async () => Promise.resolve())

    expect(stored.get('table-canvas:discovery-tours:v1:pending:account:account-1'))
      .toContain('canvas')
    first.unmount()

    render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1" user={account}>
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await act(async () => Promise.resolve())

    expect(completeDiscoveryToursMock).toHaveBeenLastCalledWith(['canvas'])
    expect(stored.get('table-canvas:discovery-tours:v1:pending:account:account-1'))
      .toBeUndefined()
  })
})
