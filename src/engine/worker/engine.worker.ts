/**
 * Web Worker entry point for DuckDB-WASM engine.
 * All heavy data operations run here, off the main thread.
 */

import * as duckdb from '@duckdb/duckdb-wasm'
import type {
  WorkerRequest,
  WorkerResponse,
  LoadTableRequest,
  AggregationDef,
} from '../types'
import type { TransformDef } from '@/types'
import { loadTable, getSlice, getAggregation, getProfile, dropTable } from './tableOperations'
import { executeTransform } from './transforms'

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

async function initDuckDB(): Promise<void> {
  if (db) return

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()

  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
  )

  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()
  db = new duckdb.AsyncDuckDB(logger, worker)

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(worker_url)

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
