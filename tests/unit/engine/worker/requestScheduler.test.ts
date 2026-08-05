import { describe, expect, it, vi } from 'vitest'
import type { WorkerRequest } from '@/engine/types'
import { WorkerRequestScheduler, isWorkerReadRequest } from '@/engine/worker/requestScheduler'

function request(id: string, type: WorkerRequest['type']): WorkerRequest {
  return { id, type, payload: {} }
}

describe('WorkerRequestScheduler', () => {
  it('classifies short reads separately from mutations', () => {
    expect(isWorkerReadRequest('getSlice')).toBe(true)
    expect(isWorkerReadRequest('getFilteredSlice')).toBe(true)
    expect(isWorkerReadRequest('loadTable')).toBe(false)
    expect(isWorkerReadRequest('executeTransform')).toBe(false)
  })

  it('lets queued reads jump ahead of waiting mutations', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const scheduler = new WorkerRequestScheduler(async (req) => {
      order.push(req.id)
      if (req.id === 'mutation-1') await firstGate
    })

    scheduler.enqueue(request('mutation-1', 'loadTable'))
    await Promise.resolve()
    scheduler.enqueue(request('mutation-2', 'loadTable'))
    scheduler.enqueue(request('read-1', 'getSlice'))
    releaseFirst()
    await vi.waitFor(() => expect(order).toEqual(['mutation-1', 'read-1', 'mutation-2']))
  })

  it('drains pending reads between mutation batches', async () => {
    const order: string[] = []
    const scheduler = new WorkerRequestScheduler(async (req) => {
      order.push(`handle:${req.id}`)
      if (req.id === 'mutation-1') {
        scheduler.enqueue(request('read-mid', 'getSlice'))
        await scheduler.flushPendingReads()
        order.push('batch-2')
      }
    })

    scheduler.enqueue(request('mutation-1', 'loadTable'))
    await vi.waitFor(() => expect(order).toEqual([
      'handle:mutation-1',
      'handle:read-mid',
      'batch-2',
    ]))
  })

  it('retains cancellation for queued and cooperatively running mutations', async () => {
    let releaseRunning!: () => void
    const runningGate = new Promise<void>(resolve => {
      releaseRunning = resolve
    })
    const cancellationObserved: string[] = []
    const scheduler = new WorkerRequestScheduler(async (req) => {
      if (req.id === 'running') await runningGate
      if (scheduler.isMutationCancelled(req.id)) cancellationObserved.push(req.id)
    })

    scheduler.enqueue(request('running', 'loadTable'))
    await Promise.resolve()
    scheduler.enqueue(request('queued', 'executeTransform'))

    expect(scheduler.cancelMutation('running')).toBe(true)
    expect(scheduler.cancelMutation('queued')).toBe(true)
    releaseRunning()

    await vi.waitFor(() => expect(cancellationObserved).toEqual(['running', 'queued']))
    expect(scheduler.isMutationCancelled('running')).toBe(false)
    expect(scheduler.isMutationCancelled('queued')).toBe(false)
  })

  it('ignores cancellation delivered after a mutation completed', async () => {
    const handled: string[] = []
    const scheduler = new WorkerRequestScheduler(async (req) => {
      handled.push(req.id)
    })

    scheduler.enqueue(request('already-complete', 'updateCell'))
    await vi.waitFor(() => expect(handled).toEqual(['already-complete']))

    expect(scheduler.cancelMutation('already-complete')).toBe(false)
    expect(scheduler.isMutationCancelled('already-complete')).toBe(false)
  })
})
