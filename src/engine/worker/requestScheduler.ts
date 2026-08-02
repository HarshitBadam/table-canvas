import type { WorkerRequest, WorkerRequestType } from '../types'

const READ_TYPES = new Set<WorkerRequestType>([
  'getSlice',
  'getFilteredSlice',
  'getDistinctValues',
  'getAggregation',
  'getProfile',
  'init',
])

export type ScheduledRequest = {
  request: WorkerRequest
  isRead: boolean
}

/**
 * Priority lane for the DuckDB worker: short reads jump ahead of waiting
 * mutations so other tables stay responsive while a large load is queued.
 * Only one request runs at a time (single DuckDB connection).
 */
export class WorkerRequestScheduler {
  private queue: ScheduledRequest[] = []
  private running = false
  private readonly handle: (request: WorkerRequest) => Promise<void>
  private midwayReads: Array<() => Promise<void>> = []

  constructor(handle: (request: WorkerRequest) => Promise<void>) {
    this.handle = handle
  }

  enqueue(request: WorkerRequest): void {
    const isRead = READ_TYPES.has(request.type)
    const item: ScheduledRequest = { request, isRead }
    if (isRead) {
      const firstMutation = this.queue.findIndex(entry => !entry.isRead)
      if (firstMutation === -1) this.queue.push(item)
      else this.queue.splice(firstMutation, 0, item)
    } else {
      this.queue.push(item)
    }
    void this.pump()
  }

  /**
   * Allow queued reads to run between mutation batches (e.g. INSERT chunks).
   * Mutations stay exclusive; only reads are drained mid-flight.
   */
  async flushPendingReads(): Promise<void> {
    while (this.queue.length > 0 && this.queue[0].isRead) {
      const next = this.queue.shift()!
      await this.handle(next.request)
    }
    const midway = this.midwayReads.splice(0)
    for (const run of midway) await run()
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift()!
        await this.handle(next.request)
      }
    } finally {
      this.running = false
      if (this.queue.length > 0) void this.pump()
    }
  }
}

export function isWorkerReadRequest(type: WorkerRequestType): boolean {
  return READ_TYPES.has(type)
}
