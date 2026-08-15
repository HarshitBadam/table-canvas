import { useCallback, useRef, useState } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useAppAuth } from '@/state/AppContext'
import { getEngine } from '@/engine/EngineAdapter'
import { getTableData } from '@/engine/materialization/tableDataService'
import { checkRowCount, checkTableCount, checkTransformOutputSafety, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { beginTableOperation } from '@/state/runtime/tableOperationCoordinator'
import type { ColumnSchema, JoinType, ProjectNode, TransformDef } from '@/types'
import { finalizeCombinedTable } from './finalizeCombinedTable'

type TransformColumnRef = {
  id: string
  colId: string
  side: 'L' | 'R'
}

export interface TransformCreationRequest {
  operation: 'join' | 'union'
  joinType: JoinType
  leftKey: string
  rightKey: string
  canUnion: boolean
  selected: Set<string>
  outputName: string
  leftNode: ProjectNode | undefined
  rightNode: ProjectNode | undefined
  sourceNodeId: string
  targetNodeId: string
  leftCols: ColumnSchema[]
  rightCols: ColumnSchema[]
  allCols: TransformColumnRef[]
  leftTotalRows: number
  rightTotalRows: number
}

interface UseTransformCreationParams {
  /** Hides the combine dialog without unmounting it (used before showing the upgrade prompt). */
  onClose: () => void
  /** Fully tears down the modal host once creation kicks off successfully. */
  onDismiss: () => void
}

/**
 * Owns the join/union creation workflow for `TransformModal`: table/row/OOM
 * gates, the async create-and-kick-off-materialization flow, and the
 * upgrade-prompt state those gates surface.
 */
export function useTransformCreation({ onClose, onDismiss }: UseTransformCreationParams) {
  const nodes = useProjectStore((s) => s.nodes)
  const addDerivedTable = useProjectStore((s) => s.addDerivedTable)
  const { user } = useAppAuth()
  const [upgradeViolation, setUpgradeViolation] = useState<LimitExceeded | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const creatingRef = useRef(false)

  const closeCombineAndOpenUpgrade = useCallback((violation: LimitExceeded) => {
    setUpgradeViolation(violation)
    onClose()
    setUpgradeOpen(true)
  }, [onClose])

  const clearCreateError = useCallback(() => setCreateError(undefined), [])

  const create = useCallback(async (request: TransformCreationRequest) => {
    if (creatingRef.current) return
    const {
      operation, joinType, leftKey, rightKey, canUnion, selected, outputName,
      leftNode, rightNode, sourceNodeId, targetNodeId, leftCols, rightCols, allCols,
      leftTotalRows, rightTotalRows,
    } = request
    if (operation === 'join' && (!leftKey || !rightKey)) return
    if (operation === 'union' && !canUnion) return
    const tier: Tier = user?.tier ?? 'guest'
    const currentTableCount = Object.values(nodes).filter(
      (n) => n.kind === 'source_table' || n.kind === 'derived_table',
    ).length
    const tableCheck = checkTableCount(currentTableCount, tier)
    if (!tableCheck.ok) {
      closeCombineAndOpenUpgrade(tableCheck)
      return
    }
    const lCols = allCols.filter(c => c.side === 'L' && selected.has(c.id)).map(c => c.colId)
    const rCols = allCols.filter(c => c.side === 'R' && selected.has(c.id) && c.colId !== rightKey).map(c => c.colId)
    const transformDef: Extract<TransformDef, { type: 'join' | 'union' }> = operation === 'union'
      ? {
          type: 'union',
          sourceTableIds: [sourceNodeId, targetNodeId],
        }
      : {
          type: 'join',
          leftTableId: sourceNodeId,
          rightTableId: targetNodeId,
          joinType,
          leftKey,
          rightKey,
          leftColumns: lCols.length < leftCols.length ? lCols : undefined,
          rightColumns: rCols.length < rightCols.length - 1 ? rCols : undefined,
          leftTableName: leftNode?.name,
          rightTableName: rightNode?.name,
        }
    creatingRef.current = true
    setIsCreating(true)
    setCreateError(undefined)
    try {
      // Count the SQL result before creating a target node so over-limit outputs
      // never appear as a stuck 0-row table. checkTransformOutputSafety runs for
      // every tier (including uncapped ones) as an OOM guard, not a plan limit.
      const [left, right] = await Promise.all([
        getTableData(sourceNodeId, 0, 1),
        getTableData(targetNodeId, 0, 1),
      ])
      if (left.error || right.error) {
        const failedTableName = left.error ? leftNode?.name : rightNode?.name
        throw new Error(
          `Unable to prepare ${failedTableName ?? 'an input table'}: ${left.error || right.error}`,
        )
      }
      // Union size is the sum of preview totals; join cardinality needs an engine count.
      let rowCount: number
      if (operation === 'union') {
        rowCount = leftTotalRows + rightTotalRows
      } else {
        const columnIdToName = Object.fromEntries(
          [...leftCols, ...rightCols].map(column => [column.id, column.name]),
        )
        rowCount = await getEngine().countCombinedTransformRows(
          transformDef,
          columnIdToName,
        )
      }
      const safetyCheck = checkTransformOutputSafety(rowCount)
      if (!safetyCheck.ok) {
        const action = operation === 'union' ? 'Appending these tables' : 'Joining these tables'
        setCreateError(`${action} ${safetyCheck.reason}`)
        return
      }
      if (tier === 'guest') {
        const rowCheck = checkRowCount(rowCount, tier)
        if (!rowCheck.ok) {
          const action = operation === 'union' ? 'Appending these tables' : 'Joining these tables'
          closeCombineAndOpenUpgrade({
            ...rowCheck,
            reason: `${action} would create ${rowCount.toLocaleString()} rows. Guest projects allow up to ${rowCheck.limit.toLocaleString()} rows per table; filter or reduce the input rows, then try again.`,
          })
          return
        }
      }
      const id = addDerivedTable({
        name: outputName.trim() || `${leftNode?.name} + ${rightNode?.name}`,
        transformDef,
        upstreamNodeIds: [sourceNodeId, targetNodeId],
      })
      const generation = beginTableOperation(id, 'waiting')
      onDismiss()
      void finalizeCombinedTable(id, generation, tier, [sourceNodeId, targetNodeId])
    } catch (error) {
      console.error('[useTransformCreation] Failed to create table:', error)
      setCreateError(
        error instanceof Error
          ? error.message
          : 'We could not create the combined table. Check the selected columns and try again.',
      )
    } finally {
      creatingRef.current = false
      setIsCreating(false)
    }
  }, [nodes, user, addDerivedTable, closeCombineAndOpenUpgrade, onDismiss])

  return {
    isCreating,
    createError,
    clearCreateError,
    upgradeViolation,
    upgradeOpen,
    setUpgradeOpen,
    create,
  }
}
