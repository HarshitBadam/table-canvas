import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscoveryTourProvider } from '@/discovery/DiscoveryTourProvider'
import { useDiscoveryTours } from '@/discovery/DiscoveryTourContext'

vi.mock('@/persistence/storage/storageScope', () => ({
  getStorageScope: () => 'account:test',
}))

let stored: Map<string, string>

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
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    } satisfies Partial<Storage>)
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('launches the canvas tour and advances through its steps', async () => {
    render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1">
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
      <DiscoveryTourProvider activeView="canvas" projectId="project-1">
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    first.unmount()

    render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1">
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not relaunch the same tour when revisiting a view in one session', async () => {
    const view = render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1">
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    view.rerender(
      <DiscoveryTourProvider activeView="dashboard" projectId="project-1">
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    view.rerender(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1">
        <div>Workspace</div>
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('allows completed tours to be replayed', async () => {
    render(
      <DiscoveryTourProvider activeView="canvas" projectId="project-1">
        <ReplayButton />
      </DiscoveryTourProvider>,
    )
    await startPendingTour()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await startPendingTour()

    expect(screen.getByRole('dialog', { name: 'Build workflows by connecting tables' })).toBeInTheDocument()
  })
})
