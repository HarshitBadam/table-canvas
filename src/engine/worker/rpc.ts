import type { WorkerRequest, WorkerResponse } from '../types'

type PendingRequest = {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
}

export class WorkerRPC {
  private worker: Worker
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private requestId = 0
  private readyPromise: Promise<void>
  private readyResolve!: () => void

  constructor(worker: Worker) {
    this.worker = worker
    
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve
    })

    this.worker.onmessage = (event: MessageEvent<WorkerResponse | { type: 'ready' }>) => {
      const data = event.data
      
      if ('type' in data && data.type === 'ready') {
        this.readyResolve()
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
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error(`Worker error: ${error.message}`))
        this.pendingRequests.delete(id)
      }
    }
  }

  async waitForReady(): Promise<void> {
    return this.readyPromise
  }

  async call<T>(type: WorkerRequest['type'], payload: unknown): Promise<T> {
    await this.readyPromise

    const id = `req_${++this.requestId}`
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      })

      const request: WorkerRequest = { id, type, payload }
      this.worker.postMessage(request)
    })
  }

  terminate(): void {
    this.worker.terminate()
    
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Worker terminated'))
      this.pendingRequests.delete(id)
    }
  }
}

