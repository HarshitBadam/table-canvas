import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ExclusiveTabGate } from './ExclusiveTabGate'

class TestLockManager {
  private held = false

  async request(
    _name: string,
    _options: LockOptions,
    callback: (lock: Lock | null) => Promise<void>,
  ): Promise<void> {
    if (this.held) {
      await callback(null)
      return
    }
    this.held = true
    await callback({ name: 'table-canvas', mode: 'exclusive' } as Lock)
    this.held = false
  }
}

describe('ExclusiveTabGate', () => {
  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
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
})
