/**
 * In-process stand-ins for Web Locks and BroadcastChannel. Shared buses let
 * tests run several "tabs" (separate module registries) against one lock
 * manager and one channel bus.
 */

interface FakeLock {
  name: string
  mode: LockMode
  clientId: string
}

interface HeldLock {
  name: string
  mode: LockMode
  clientId: string
  release: () => void
}

interface QueuedRequest {
  name: string
  mode: LockMode
  clientId: string
  ifAvailable: boolean
  grant: () => void
  reject: (error: Error) => void
}

let nextClientId = 1

function abortError(): Error {
  const error = new Error('The lock request was aborted.')
  error.name = 'AbortError'
  return error
}

function canGrant(held: HeldLock[], mode: LockMode): boolean {
  if (held.length === 0) return true
  if (mode === 'shared') return held.every(lock => lock.mode === 'shared')
  return false
}

export class FakeLockManager {
  private readonly held = new Map<string, HeldLock[]>()
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
    if (options.ifAvailable && options.signal) {
      return Promise.reject(new DOMException(
        "The 'signal' and 'ifAvailable' options cannot be used together.",
        'NotSupportedError',
      ))
    }
    const mode: LockMode = options.mode ?? 'exclusive'
    const clientId = `client-${nextClientId++}`
    return new Promise((resolve, reject) => {
      const run = () => {
        let releaseHeld: (() => void) | null = null
        const entry: HeldLock = {
          name,
          mode,
          clientId,
          release: () => {
            releaseHeld?.()
          },
        }
        const bucket = this.held.get(name) ?? []
        bucket.push(entry)
        this.held.set(name, bucket)

        releaseHeld = () => {
          const current = this.held.get(name) ?? []
          const index = current.indexOf(entry)
          if (index >= 0) current.splice(index, 1)
          if (current.length === 0) this.held.delete(name)
          this.drain(name)
        }

        void Promise.resolve(callback({ name, mode, clientId }))
          .then(resolve, reject)
          .finally(() => {
            entry.release()
          })
      }

      const held = this.held.get(name) ?? []
      if (canGrant(held, mode)) {
        run()
        return
      }

      if (options.ifAvailable) {
        void Promise.resolve(callback(null)).then(resolve, reject)
        return
      }

      const queued: QueuedRequest = {
        name,
        mode,
        clientId,
        ifAvailable: false,
        grant: run,
        reject,
      }
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

  async query(): Promise<{
    held: Array<{ name: string; mode: LockMode; clientId: string }>
    pending: Array<{ name: string; mode: LockMode; clientId: string }>
  }> {
    const held = [...this.held.values()].flat().map(lock => ({
      name: lock.name,
      mode: lock.mode,
      clientId: lock.clientId,
    }))
    const pending = [...this.queues.values()].flat().map(request => ({
      name: request.name,
      mode: request.mode,
      clientId: request.clientId,
    }))
    return { held, pending }
  }

  isHeld(name: string): boolean {
    return (this.held.get(name)?.length ?? 0) > 0
  }

  holderCount(name: string): number {
    return this.held.get(name)?.length ?? 0
  }

  private drain(name: string): void {
    const queue = this.queues.get(name)
    if (!queue || queue.length === 0) return
    while (queue.length > 0) {
      const held = this.held.get(name) ?? []
      const next = queue[0]
      if (!canGrant(held, next.mode)) break
      queue.shift()
      next.grant()
      // After granting a shared lock, keep draining additional shared waiters.
      if (next.mode === 'exclusive') break
    }
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
