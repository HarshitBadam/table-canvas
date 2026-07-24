import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExclusiveTabGate } from './ExclusiveTabGate'
import { prepareForTabRelease } from '@/state/tabOwnership'

vi.mock('@/state/tabOwnership', () => ({
  prepareForTabRelease: vi.fn().mockResolvedValue(undefined),
}))

class TestLockManager {
  private held = false
  private waiters: Array<() => void> = []

  async request(
    _name: string,
    _options: LockOptions,
    callback: (lock: Lock | null) => Promise<void>,
  ): Promise<void> {
    if (this.held) {
      if (_options.ifAvailable) {
        await callback(null)
        return
      }
      await new Promise<void>(resolve => this.waiters.push(resolve))
    }
    this.held = true
    await callback({ name: 'table-canvas', mode: 'exclusive' } as Lock)
    this.held = false
    this.waiters.shift()?.()
  }
}

describe('ExclusiveTabGate', () => {
  afterEach(() => {
    vi.mocked(prepareForTabRelease).mockReset().mockResolvedValue(undefined)
    localStorage.removeItem('table-canvas:tab-takeover')
  })

  it('allows one writer and blocks a concurrent tab', async () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: new TestLockManager(),
    })

    const first = render(
      <ExclusiveTabGate>
        <p>Active workspace</p>
      </ExclusiveTabGate>,
    )
    await screen.findByText('Active workspace')

    const second = render(
      <ExclusiveTabGate>
        <p>Second workspace</p>
      </ExclusiveTabGate>,
    )
    await screen.findByText('Table Canvas is open in another tab')
    expect(screen.queryByText('Second workspace')).not.toBeInTheDocument()

    first.unmount()
    second.unmount()
    await waitFor(() => expect(screen.queryByText('Active workspace')).toBeNull())
  })

  it('waits for the active tab to finish saving before completing a takeover', async () => {
    let finishSave: (() => void) | undefined
    vi.mocked(prepareForTabRelease).mockImplementation(
      () => new Promise<void>(resolve => {
        finishSave = resolve
      }),
    )
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: new TestLockManager(),
    })

    const first = render(
      <ExclusiveTabGate>
        <p>Active workspace</p>
      </ExclusiveTabGate>,
    )
    await screen.findByText('Active workspace')
    const second = render(
      <ExclusiveTabGate>
        <p>Replacement workspace</p>
      </ExclusiveTabGate>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Use this tab instead' }))

    const takeoverMessage = localStorage.getItem('table-canvas:tab-takeover')
    expect(takeoverMessage).not.toBeNull()
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'table-canvas:tab-takeover',
      newValue: takeoverMessage,
    }))
    await screen.findByText('Opening Table Canvas…')
    expect(screen.queryByText('Replacement workspace')).not.toBeInTheDocument()

    finishSave?.()
    await screen.findByText('Replacement workspace')
    await waitFor(() => expect(screen.queryByText('Active workspace')).not.toBeInTheDocument())

    first.unmount()
    second.unmount()
  })
})
