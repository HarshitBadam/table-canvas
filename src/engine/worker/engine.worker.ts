import * as duckdb from '@duckdb/duckdb-wasm'
import type {
  WorkerRequest,
  WorkerResponse,
  LoadTableRequest,
  AggregationDef,
} from '../types'
import type { TransformDef } from '@/types'
import { loadTable, getSlice, getFilteredSlice, updateCell, insertRow, deleteRow, getDistinctValues, getAggregation, getProfile, dropTable } from './tableOperations'
import { executeTransform } from './transforms'

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

async function initDuckDB(): Promise<void> {
  if (db) return

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
      mainWorker: '/duckdb/duckdb-browser-coi.worker.js',
      pthreadWorker: '/duckdb/duckdb-browser-coi.pthread.worker.js',
    },
  }

  const bundle = await duckdb.selectBundle(LOCAL_BUNDLES)

  const worker = new Worker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger()
  db = new duckdb.AsyncDuckDB(logger, worker)

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)

  conn = await db.connect()
}

function requireConn(): duckdb.AsyncDuckDBConnection {
  if (!conn) throw new Error('DuckDB not initialized')
  return conn
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data

  try {
    let result: unknown

    switch (type) {
      case 'init':
        await initDuckDB()
        result = { success: true }
        break

      case 'loadTable':
        await loadTable(requireConn(), payload as LoadTableRequest)
        result = { success: true }
        break

      case 'executeTransform':
        result = await executeTransform(requireConn(), payload as TransformDef & { outputTableId: string })
        break

      case 'getSlice': {
        const { tableId, offset, limit } = payload as { tableId: string; offset: number; limit: number }
        result = await getSlice(requireConn(), tableId, offset, limit)
        break
      }

      case 'getFilteredSlice': {
        const { tableId, filters, sorts, search, offset, limit } = payload as {
          tableId: string; filters?: import('../types').FilterConditionDef[];
          sorts?: import('../types').SortDef[]; search?: string; offset: number; limit: number
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
          tableId: string; rowId: string; column: string; value: import('@/types').CellValue; columnType?: string
        }
        await updateCell(requireConn(), tableId, rowId, column, value, columnType)
        result = { success: true }
        break
      }

      case 'insertRow': {
        const { tableId, values, columns, types } = payload as {
          tableId: string; values: Record<string, import('@/types').CellValue>; columns: string[]; types: string[]
        }
        await insertRow(requireConn(), tableId, values, columns, types)
        result = { success: true }
        break
      }

      case 'deleteRow': {
        const { tableId, rowIndex } = payload as { tableId: string; rowIndex: number }
        await deleteRow(requireConn(), tableId, rowIndex)
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
        await dropTable(requireConn(), payload as string)
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

self.postMessage({ type: 'ready' })
