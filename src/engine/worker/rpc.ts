import type { WorkerRequest, WorkerResponse, WorkerToMainMessage } from '../types'

const MUTATING_REQUEST_TYPES = new Set<WorkerRequest['type']>([
  'loadTable',
  'executeTransform',
  'updateCell',
  'insertRow',
  'deleteRow',
  'dropTable',
])

type PendingRequest = {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

export class WorkerRPC {
  private worker: Worker
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private requestId = 0
  private readyPromise: Promise<void>
  private readyResolve!: () => void
  private readyReject!: (error: Error) => void
  private readySettled = false
  private failure: Error | null = null

  constructor(worker: Worker) {
    this.worker = worker
    
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    void this.readyPromise.catch(() => undefined)

    this.worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const data = event.data

      if ('type' in data && data.type === 'ready') {
        this.readySettled = true
        this.readyResolve()
        return
      }

      if ('type' in data && data.type === 'prepareCommit') {
        this.decideCommit(data.requestId)
        return
      }

      const response = data as WorkerResponse
      const pending = this.pendingRequests.get(response.id)
      
      if (pending) {
        this.pendingRequests.delete(response.id)
        
        if (response.success) {
          pending.resolve(response.data)
        } else {
          pending.reject(new Error(response.error || 'Unknown worker error'))
        }
      }
    }

    this.worker.onerror = (error) => {
      console.error('Worker error:', error)
      this.fail(new Error(`Worker error: ${error.message}`))
    }

    this.worker.onmessageerror = (error) => {
      console.error('Worker message error:', error)
      this.fail(new Error('Worker message could not be decoded'))
    }
  }

  async waitForReady(): Promise<void> {
    return this.readyPromise
  }

  async call<T>(type: WorkerRequest['type'], payload: unknown, timeoutMs: number = 120000): Promise<T> {
    await this.readyPromise
    if (this.failure) throw this.failure

    const id = `req_${++this.requestId}`

    return new Promise((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: (data: unknown) => { this.clearTimer(pending); resolve(data as T) },
        reject: (err: Error) => { this.clearTimer(pending); reject(err) },
        timer: null,
      }

      pending.timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          if (MUTATING_REQUEST_TYPES.has(type)) {
            this.worker.postMessage({ type: 'cancelMutation', requestId: id })
          }
          reject(new Error(`Worker RPC timeout after ${timeoutMs}ms for request type: ${type}`))
        }
      }, timeoutMs)

      this.pendingRequests.set(id, pending)

      const request: WorkerRequest = { id, type, payload }
      this.worker.postMessage(request)
    })
  }

  terminate(): void {
    this.worker.terminate()
    this.fail(new Error('Worker terminated'))
  }

  private clearTimer(pending: PendingRequest): void {
    if (pending.timer) {
      clearTimeout(pending.timer)
      pending.timer = null
    }
  }

  /**
   * The single, race-free decision point for whether a mutation may commit.
   * A pending request's fate hinges only on whether it is still present in
   * `pendingRequests` at the moment this handler runs: the timeout callback
   * and this handler both run as ordinary, non-preemptible event-loop tasks,
   * so exactly one of them observes the entry and removes/disarms it first.
   * There is no window in which both a timeout rejection and a commit grant
   * can be issued for the same request id.
   */
  private decideCommit(requestId: string): void {
    const pending = this.pendingRequests.get(requestId)
    if (pending) {
      // Disarm the timeout permanently: this request has reached the point of
      // no return in the worker and must be allowed to run to completion.
      this.clearTimer(pending)
    }
    this.worker.postMessage({ type: 'commitDecision', requestId, granted: Boolean(pending) })
  }

  private fail(error: Error): void {
    if (!this.failure) this.failure = error
    if (!this.readySettled) {
      this.readySettled = true
      this.readyReject(this.failure)
    }
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(this.failure)
      this.pendingRequests.delete(id)
    }
  }
}

