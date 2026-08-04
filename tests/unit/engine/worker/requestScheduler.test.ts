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
})
