import { getEngine } from './EngineAdapter'
import { getComputationOrder } from './dependencyGraph'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore, TableRow } from '@/state/dataStore'
import { loadFileWithSync } from '@/persistence/syncService'
import {
  computePatchesVersion,
  computeSourceVersionHash,
  getEngineTableRowCount,
} from './cacheUtils'
import { computeDerivedTable } from './derivedTableComputation'
import { loadEngineTable } from './loadTableIntoEngine'
import type {
  SourceTableNode,
  CellValue,
  TableSchema,
} from '@/types'


type MaterializationStatus =
  | 'cached'
  | 'computed'
  | 'loading'
  | 'error'

export interface MaterializationResult {
  status: MaterializationStatus
  tableId: string
  rowCount?: number
  schema?: TableSchema
  error?: string
}

const inProgressMaterializations = new Map<string, Promise<MaterializationResult>>()

let materializationQueue = Promise.resolve()


async function loadSourceTable(tableId: string): Promise<MaterializationResult> {
  const projectStore = useProjectStore.getState()
  const dataStore = useDataStore.getState()
  const node = projectStore.getTableNode(tableId) as SourceTableNode | undefined

  if (!node || node.kind !== 'source_table') {
    return {
      status: 'error',
      tableId,
      error: 'Source table not found',
    }
  }

  projectStore.updateCacheInfo(tableId, { isComputing: true, error: undefined })

  try {
    const existingData = dataStore.tableData[tableId]
    const patches = projectStore.patches[tableId]

    const patchVersion = computePatchesVersion(patches)

    const currentVersionHash = computeSourceVersionHash(
      tableId,
      node.plan.fileRef,
      patchVersion
    )

    const engineRowCount = await getEngineTableRowCount(tableId)
    const existsInEngine = engineRowCount >= 0
    const expectedRows = node.cacheInfo?.lastRowCount
    const engineHasExpectedData =
      expectedRows !== undefined && engineRowCount === expectedRows

    if (
      existsInEngine &&
      engineHasExpectedData &&
      node.cacheInfo?.currentVersionHash === currentVersionHash &&
      !node.cacheInfo?.isDirty
    ) {
      projectStore.updateCacheInfo(tableId, { isComputing: false })
      return {
        status: 'cached',
        tableId,
        rowCount: node.cacheInfo?.lastRowCount ?? 0,
      }
    }

    let rows: TableRow[] = []

    if (node.plan.fileRef) {
      const fileData = await loadFileWithSync(node.plan.fileRef)
      if (fileData) {
        const { parseFileData } = await import('./fileParsers')
        rows = await parseFileData(fileData, node.plan.fileType, node.plan.sheetName, node.schema)

        rows = rows.map((row, idx) => ({
          ...row,
          __rowId: row.__rowId || `row_${idx}`,
        }))

        dataStore.setTableData(tableId, [])
      } else {
        projectStore.updateCacheInfo(tableId, {
          isComputing: false,
          error: 'Data file not found. Please re-import the file.',
        })

        return {
          status: 'error',
          tableId,
          error: 'Data file not found. Please re-import the file.',
        }
      }
    } else {
      const initialRows = node.plan.initialRows as TableRow[] | undefined
      const runtimeRows = existingData?.rows
      rows = initialRows
        ?? (runtimeRows?.length ? runtimeRows : Array.from(
          { length: node.schema?.rowCount ?? 0 },
          (_, index) => ({ __rowId: `row_${index}` }),
        ))
      if (!initialRows && !runtimeRows?.length) {
        dataStore.setTableData(tableId, [])
      }
    }

    if (node.schema) {
      await loadEngineTable(tableId, node.schema, rows as Record<string, CellValue>[], patches)
    }
    const loadedRowCount = await getEngineTableRowCount(tableId)
    const rowCount = loadedRowCount >= 0 ? loadedRowCount : rows.length

    projectStore.updateCacheInfo(tableId, {
      isDirty: false,
      isComputing: false,
      lastComputedAt: new Date().toISOString(),
      currentVersionHash,
      lastRowCount: rowCount,
      error: undefined,
    })

    return {
      status: 'computed',
      tableId,
      rowCount,
      schema: node.schema,
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    projectStore.updateCacheInfo(tableId, {
      isComputing: false,
      error: errorMessage,
    })

    return {
      status: 'error',
      tableId,
      error: errorMessage,
    }
  }
}


export async function ensureTableMaterialized(tableId: string): Promise<MaterializationResult> {
  const existingPromise = inProgressMaterializations.get(tableId)
  if (existingPromise) {
    return existingPromise
  }

  const materializationPromise = (async () => {
    const queuePromise = materializationQueue.then(async () => {
      return await materializeTableInternal(tableId)
    })

    materializationQueue = queuePromise.then(() => {}).catch(() => {})

    return queuePromise
  })()

  inProgressMaterializations.set(tableId, materializationPromise)

  try {
    const result = await materializationPromise
    return result
  } finally {
    inProgressMaterializations.delete(tableId)
  }
}

async function materializeTableInternal(tableId: string): Promise<MaterializationResult> {
  const projectStore = useProjectStore.getState()
  const node = projectStore.getTableNode(tableId)

  if (!node) {
    return {
      status: 'error',
      tableId,
      error: 'Table not found',
    }
  }

  if (node.kind === 'source_table') {
    return loadSourceTable(tableId)
  }

  const computationOrder = getComputationOrder(
    tableId,
    projectStore.nodes,
    projectStore.edges
  )

  for (const nodeToCompute of computationOrder) {
    const tableNode = projectStore.getTableNode(nodeToCompute)
    if (!tableNode) continue

    if (tableNode.kind === 'source_table') {
      const result = await loadSourceTable(nodeToCompute)
      if (result.status === 'error') {
        if (nodeToCompute !== tableId) {
          projectStore.updateCacheInfo(tableId, {
            isComputing: false,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          })
          return {
            status: 'error',
            tableId,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          }
        }
        return result
      }
    } else if (tableNode.kind === 'derived_table') {
      const result = await computeDerivedTable(nodeToCompute)
      if (result.status === 'error') {
        if (nodeToCompute !== tableId) {
          projectStore.updateCacheInfo(tableId, {
            isComputing: false,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          })
          return {
            status: 'error',
            tableId,
            error: `Upstream table "${tableNode.name}" failed: ${result.error}`,
          }
        }
        return result
      }
    }
  }

  const finalNode = projectStore.getTableNode(tableId)
  return {
    status: finalNode?.cacheInfo?.error ? 'error' : 'computed',
    tableId,
    rowCount: finalNode?.cacheInfo?.lastRowCount,
    schema: finalNode?.schema,
    error: finalNode?.cacheInfo?.error,
  }
}


export async function getTableData(
  tableId: string,
  offset: number = 0,
  limit: number = 1000
): Promise<{ rows: TableRow[]; totalRows: number; error?: string }> {
  const result = await ensureTableMaterialized(tableId)

  if (result.status === 'error') {
    return {
      rows: [],
      totalRows: 0,
      error: result.error,
    }
  }

  try {
    const engine = getEngine()
    const node = useProjectStore.getState().getTableNode(tableId)
    const slice = await engine.getSlice(tableId, offset, limit, node?.schema?.columns)

    const rows: TableRow[] = slice.rows.map((row, idx) => ({
      ...row,
      __rowId: row.__rowId as string || `row_${offset + idx}`,
    })) as TableRow[]

    return {
      rows,
      totalRows: slice.totalRows,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      rows: [],
      totalRows: 0,
      error: errorMessage,
    }
  }
}
