import * as duckdb from '@duckdb/duckdb-wasm'
import type {
  WorkerRequest,
  WorkerMessage,
  WorkerResponse,
  LoadTableRequest,
  AggregationDef,
  FilterConditionDef,
  SortDef,
} from '../types'
import type { CellValue, TransformDef } from '@/types'
import { loadTable, getSlice, getFilteredSlice, updateCell, insertRow, deleteRow, getDistinctValues, getAggregation, getProfile, dropTable } from './table/tableOperations'
import { countCombinedTransformRows, executeTransform } from './transforms'
import { WorkerRequestScheduler } from './requestScheduler'

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null
let initPromise: Promise<void> | null = null
let scheduler: WorkerRequestScheduler | null = null

async function mutationCheckpoint(requestId: string): Promise<void> {
  // Yield to the worker event loop so a cancellation posted while DuckDB was
  // busy can be observed before the surrounding transaction commits. This is
  // an intermediate, still-abortable checkpoint: a rejection here is always
  // followed by a ROLLBACK, so a same-event-loop-gap race here is harmless.
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  if (scheduler?.isMutationCancelled(requestId)) {
    throw new Error('Worker mutation cancelled')
  }
}

const pendingCommitDecisions = new Map<string, (granted: boolean) => void>()

function requestCommitDecision(requestId: string): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    pendingCommitDecisions.set(requestId, resolve)
    self.postMessage({ type: 'prepareCommit', requestId })
  })
}

/**
 * The single point that may irrevocably commit a mutation (the final
 * statement of a transaction, or the sole statement of an atomic
 * single-statement mutation). Unlike `mutationCheckpoint`, this does not
 * rely on a local flag plus a timing gap: it round-trips through the main
 * thread, which is the only place that knows whether the RPC timeout has
 * already fired for this request. The main thread answers synchronously
 * against its own pending-request bookkeeping, so the timeout firing and
 * this decision can never both apply to the same request - one necessarily
 * happens first and permanently decides the outcome.
 */
async function finalizeCommit(requestId: string): Promise<void> {
  if (scheduler?.isMutationCancelled(requestId)) {
    throw new Error('Worker mutation cancelled')
  }
  const granted = await requestCommitDecision(requestId)
  if (!granted) {
    throw new Error('Worker mutation cancelled')
  }
}

async function initDuckDB(): Promise<void> {
  if (db && conn) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    const LOCAL_BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule: '/duckdb/duckdb-mvp.wasm',
        mainWorker: '/duckdb/duckdb-browser-mvp.worker.js',
      },
      eh: {
        mainModule: '/duckdb/duckdb-eh.wasm',
        mainWorker: '/duckdb/duckdb-browser-eh.worker.js',
      },
      coi: {
        mainModule: '/duckdb/duckdb-coi.wasm',
        mainWorker: '/duckdb/duckdb-browser-coi.pthread.worker.js',
        pthreadWorker: '/duckdb/duckdb-browser-coi.pthread.worker.js',
      },
    }

    const bundle = await duckdb.selectBundle(LOCAL_BUNDLES)
    const worker = new Worker(bundle.mainWorker!)
    const logger = new duckdb.ConsoleLogger()
    const nextDb = new duckdb.AsyncDuckDB(logger, worker)

    try {
      await nextDb.instantiate(bundle.mainModule, bundle.pthreadWorker)
      await nextDb.open({ path: ':memory:' })
      const nextConn = await nextDb.connect()
      db = nextDb
      conn = nextConn
    } catch (error) {
      await nextDb.terminate().catch(() => undefined)
      throw error
    }
  })()
  try {
    await initPromise
  } finally {
    initPromise = null
  }
}

function requireConn(): duckdb.AsyncDuckDBConnection {
  if (!conn) throw new Error('DuckDB not initialized')
  return conn
}

async function handleRequest(request: WorkerRequest): Promise<void> {
  const { id, type, payload } = request

  try {
    if (scheduler?.isMutationCancelled(id)) throw new Error('Worker mutation cancelled')
    let result: unknown

    switch (type) {
      case 'init':
        await initDuckDB()
        result = { success: true }
        break

      case 'loadTable':
        await loadTable(
          requireConn(),
          payload as LoadTableRequest,
          async () => {
            await scheduler?.flushPendingReads()
            await mutationCheckpoint(id)
          },
          () => finalizeCommit(id),
        )
        result = { success: true }
        break

      case 'executeTransform':
        result = await executeTransform(
          requireConn(),
          payload as TransformDef & { outputTableId: string },
          () => mutationCheckpoint(id),
          () => finalizeCommit(id),
        )
        break

      case 'countCombinedTransformRows':
        result = await countCombinedTransformRows(
          requireConn(),
          payload as Extract<TransformDef, { type: 'join' | 'union' }>,
        )
        break

      case 'getSlice': {
        const { tableId, offset, limit } = payload as { tableId: string; offset: number; limit: number }
        result = await getSlice(requireConn(), tableId, offset, limit)
        break
      }

      case 'getFilteredSlice': {
        const { tableId, filters, sorts, search, offset, limit } = payload as {
          tableId: string
          filters?: FilterConditionDef[]
          sorts?: SortDef[]
          search?: string
          offset: number
          limit: number
        }
        result = await getFilteredSlice(requireConn(), tableId, filters, sorts, search, offset, limit)
        break
      }

      case 'getDistinctValues': {
        const { tableId, column, limit } = payload as { tableId: string; column: string; limit?: number }
        result = await getDistinctValues(requireConn(), tableId, column, limit)
        break
      }

      case 'updateCell': {
        const { tableId, rowId, column, value, columnType } = payload as {
          tableId: string
          rowId: string
          column: string
          value: CellValue
          columnType?: string
        }
        await updateCell(requireConn(), tableId, rowId, column, value, columnType, () => finalizeCommit(id))
        result = { success: true }
        break
      }

      case 'insertRow': {
        const { tableId, values, columns, types } = payload as {
          tableId: string
          values: Record<string, CellValue>
          columns: string[]
          types: string[]
        }
        await insertRow(requireConn(), tableId, values, columns, types, () => finalizeCommit(id))
        result = { success: true }
        break
      }

      case 'deleteRow': {
        const { tableId, rowIndex } = payload as { tableId: string; rowIndex: number }
        await deleteRow(requireConn(), tableId, rowIndex, () => finalizeCommit(id))
        result = { success: true }
        break
      }

      case 'getAggregation': {
        const { tableId, aggDef } = payload as { tableId: string; aggDef: AggregationDef }
        result = await getAggregation(requireConn(), tableId, aggDef)
        break
      }

      case 'getProfile': {
        const { tableId, phase } = payload as { tableId: string; phase: 1 | 2 }
        result = await getProfile(requireConn(), tableId, phase)
        break
      }

      case 'dropTable':
        await dropTable(requireConn(), payload as string, () => finalizeCommit(id))
        result = { success: true }
        break

      default:
        throw new Error(`Unknown request type: ${type}`)
    }

    const response: WorkerResponse = { id, success: true, data: result }
    self.postMessage(response)

  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}

scheduler = new WorkerRequestScheduler(handleRequest)

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === 'cancelMutation') {
    scheduler?.cancelMutation(event.data.requestId)
    return
  }
  if (event.data.type === 'commitDecision') {
    const resolve = pendingCommitDecisions.get(event.data.requestId)
    if (resolve) {
      pendingCommitDecisions.delete(event.data.requestId)
      resolve(event.data.granted)
    }
    return
  }
  scheduler?.enqueue(event.data)
}

self.postMessage({ type: 'ready' })
