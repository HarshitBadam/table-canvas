import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkerRPC } from '@/engine/worker/rpc'
import type { WorkerRequest, WorkerToMainMessage } from '@/engine/types'

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: unknown[] = []
  readonly terminate = vi.fn()

  postMessage(message: unknown): void {
    this.messages.push(message)
  }

  emitMessage(message: WorkerToMainMessage): void {
    this.onmessage?.({ data: message } as MessageEvent)
  }

  emitError(message: string): void {
    this.onerror?.({ message } as ErrorEvent)
  }

  emitMessageError(): void {
    this.onmessageerror?.({ data: null } as MessageEvent)
  }
}

function asWorker(worker: FakeWorker): Worker {
  return worker as unknown as Worker
}

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('@/engine/worker/engine.worker?worker')
  vi.resetModules()
})

describe('WorkerRPC lifecycle', () => {
  it('rejects readiness when worker bootstrap fails', async () => {
    const worker = new FakeWorker()
    const rpc = new WorkerRPC(asWorker(worker))

    worker.emitError('failed to load module')

    await expect(rpc.waitForReady()).rejects.toThrow(
      'Worker error: failed to load module',
    )
  })

  it('rejects readiness when a bootstrap message cannot be decoded', async () => {
    const worker = new FakeWorker()
    const rpc = new WorkerRPC(asWorker(worker))

    worker.emitMessageError()

    await expect(rpc.waitForReady()).rejects.toThrow(
      'Worker message could not be decoded',
    )
  })

  it('rejects readiness when terminated before ready', async () => {
    const worker = new FakeWorker()
    const rpc = new WorkerRPC(asWorker(worker))

    rpc.terminate()

    await expect(rpc.waitForReady()).rejects.toThrow('Worker terminated')
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('rejects pending calls when a worker message cannot be decoded', async () => {
    const worker = new FakeWorker()
    const rpc = new WorkerRPC(asWorker(worker))
    worker.emitMessage({ type: 'ready' })
    const call = rpc.call('updateCell', {})
    await Promise.resolve()

    worker.emitMessageError()

    await expect(call).rejects.toThrow('Worker message could not be decoded')
  })

  it('posts cooperative cancellation when a mutation times out', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const rpc = new WorkerRPC(asWorker(worker))
    worker.emitMessage({ type: 'ready' })

    const call = rpc.call('loadTable', {}, 25)
    await Promise.resolve()
    const rejection = expect(call).rejects.toThrow('Worker RPC timeout')
    await vi.advanceTimersByTimeAsync(25)

    await rejection
    expect(worker.messages).toEqual([
      expect.objectContaining({ id: 'req_1', type: 'loadTable' }),
      { type: 'cancelMutation', requestId: 'req_1' },
    ])
  })

  it('does not redesign timed-out read requests as cancellable mutations', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const rpc = new WorkerRPC(asWorker(worker))
    worker.emitMessage({ type: 'ready' })

    const call = rpc.call('getSlice', {}, 25)
    await Promise.resolve()
    const rejection = expect(call).rejects.toThrow('Worker RPC timeout')
    await vi.advanceTimersByTimeAsync(25)

    await rejection
    expect(worker.messages).toHaveLength(1)
    expect((worker.messages[0] as WorkerRequest).type).toBe('getSlice')
  })
})

describe('prepare/commit handshake closes the timeout-to-commit race', () => {
  // Every mutation class the worker can irrevocably commit: the multi-step
  // transactional ones (loadTable, executeTransform) and the atomic
  // single-statement ones (updateCell, insertRow, deleteRow, dropTable).
  const mutationTypes: WorkerRequest['type'][] = [
    'loadTable',
    'executeTransform',
    'updateCell',
    'insertRow',
    'deleteRow',
    'dropTable',
  ]

  it.each(mutationTypes)(
    'grants commit and permanently disarms the timeout when the worker reaches the point of no return first (%s)',
    async (type) => {
      vi.useFakeTimers()
      const worker = new FakeWorker()
      const rpc = new WorkerRPC(asWorker(worker))
      worker.emitMessage({ type: 'ready' })

      const call = rpc.call(type, {}, 25)
      await Promise.resolve()
      const requestId = (worker.messages[0] as WorkerRequest).id

      // The worker asks permission to commit before the deadline elapses.
      await vi.advanceTimersByTimeAsync(10)
      worker.emitMessage({ type: 'prepareCommit', requestId })

      expect(worker.messages).toContainEqual({ type: 'commitDecision', requestId, granted: true })

      // Advancing past the original deadline must not retroactively cancel or
      // reject a request whose commit was already granted - the decision is
      // permanent, not merely "not yet timed out".
      await vi.advanceTimersByTimeAsync(50)
      expect(worker.messages.some((message) => (message as { type?: string }).type === 'cancelMutation')).toBe(false)

      worker.emitMessage({ id: requestId, success: true, data: { ok: true } })
      await expect(call).resolves.toEqual({ ok: true })
    },
  )

  it.each(mutationTypes)(
    'denies commit when the RPC timeout already rejected the caller first (%s)',
    async (type) => {
      vi.useFakeTimers()
      const worker = new FakeWorker()
      const rpc = new WorkerRPC(asWorker(worker))
      worker.emitMessage({ type: 'ready' })

      const call = rpc.call(type, {}, 25)
      await Promise.resolve()
      const requestId = (worker.messages[0] as WorkerRequest).id
      const rejection = expect(call).rejects.toThrow('Worker RPC timeout')
      await vi.advanceTimersByTimeAsync(25)
      await rejection

      // The worker only reaches its point of no return after the caller has
      // already been told the mutation timed out - the guarantee requires
      // that this request can never be told it may commit.
      worker.emitMessage({ type: 'prepareCommit', requestId })

      expect(worker.messages).toContainEqual({ type: 'commitDecision', requestId, granted: false })
    },
  )

  it('resolves normally when the real response arrives after a granted commit, with no lingering timer', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const rpc = new WorkerRPC(asWorker(worker))
    worker.emitMessage({ type: 'ready' })

    const call = rpc.call('updateCell', {}, 25)
    await Promise.resolve()
    const requestId = (worker.messages[0] as WorkerRequest).id

    worker.emitMessage({ type: 'prepareCommit', requestId })
    // Far beyond the original deadline - proves the timer was cleared, not
    // just outraced once.
    await vi.advanceTimersByTimeAsync(10_000)

    worker.emitMessage({ id: requestId, success: true, data: null })
    await expect(call).resolves.toBeNull()
    expect(worker.messages.filter((message) => (message as { type?: string }).type === 'cancelMutation')).toHaveLength(0)
  })
})

describe('EngineAdapter worker retry', () => {
  it('creates a clean worker after bootstrap failure', async () => {
    const workers: FakeWorker[] = []
    vi.doMock('@/engine/worker/engine.worker?worker', () => ({
      default: class {
        constructor() {
          const worker = new FakeWorker()
          workers.push(worker)
          return worker
        }
      },
    }))

    const { getEngine } = await import('@/engine/EngineAdapter')
    const engine = getEngine()
    const firstInit = engine.init()
    workers[0].emitError('bootstrap failed')
    await expect(firstInit).rejects.toThrow('Worker error: bootstrap failed')

    expect(workers).toHaveLength(2)
    const retry = engine.init()
    workers[1].emitMessage({ type: 'ready' })
    await vi.waitFor(() => expect(workers[1].messages).toHaveLength(1))
    const request = workers[1].messages[0] as WorkerRequest
    workers[1].emitMessage({ id: request.id, success: true })

    await expect(retry).resolves.toBeUndefined()
  })
})
