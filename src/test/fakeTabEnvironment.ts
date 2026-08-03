/**
 * In-process stand-ins for the two browser APIs that coordinate tabs: Web Locks and
 * BroadcastChannel. Both are shared buses, so tests can run several "tabs" (separate
 * module registries) against one lock manager and one channel bus.
 */

interface FakeLock {
  name: string
  mode: LockMode
}

interface QueuedRequest {
  grant: () => void
  reject: (error: Error) => void
}

function abortError(): Error {
  const error = new Error('The lock request was aborted.')
  error.name = 'AbortError'
  return error
}

export class FakeLockManager {
  private readonly held = new Set<string>()
  private readonly queues = new Map<string, QueuedRequest[]>()

  request(
    name: string,
    options: {
      mode?: LockMode
      ifAvailable?: boolean
      signal?: AbortSignal | null
    },
    callback: (lock: FakeLock | null) => Promise<unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.held.add(name)
        void Promise.resolve(callback({ name, mode: options.mode ?? 'exclusive' }))
          .then(resolve, reject)
          .finally(() => {
            this.held.delete(name)
            this.queues.get(name)?.shift()?.grant()
          })
      }

      if (!this.held.has(name)) {
        run()
        return
      }

      if (options.ifAvailable) {
        void Promise.resolve(callback(null)).then(resolve, reject)
        return
      }

      const queued: QueuedRequest = { grant: run, reject }
      const queue = this.queues.get(name) ?? []
      queue.push(queued)
      this.queues.set(name, queue)

      options.signal?.addEventListener('abort', () => {
        const pending = this.queues.get(name)
        const index = pending?.indexOf(queued) ?? -1
        if (!pending || index === -1) return
        pending.splice(index, 1)
        reject(abortError())
      }, { once: true })
    })
  }

  /** True while some tab holds the lock. */
  isHeld(name: string): boolean {
    return this.held.has(name)
  }
}

type ChannelListener = (event: { data: unknown }) => void

const channelBus = new Map<string, Set<FakeBroadcastChannel>>()

export class FakeBroadcastChannel {
  onmessage: ChannelListener | null = null
  private closed = false

  constructor(readonly name: string) {
    const peers = channelBus.get(name) ?? new Set<FakeBroadcastChannel>()
    peers.add(this)
    channelBus.set(name, peers)
  }

  postMessage(data: unknown): void {
    if (this.closed) return
    const payload = structuredClone(data)
    for (const peer of channelBus.get(this.name) ?? []) {
      if (peer === this || peer.closed) continue
      queueMicrotask(() => peer.onmessage?.({ data: payload }))
    }
  }

  close(): void {
    this.closed = true
    channelBus.get(this.name)?.delete(this)
  }
}

export function resetChannelBus(): void {
  channelBus.clear()
}

/** Drains the microtasks and timers that lease handover and mirroring queue up. */
export async function settleTabs(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}
