import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import type { TableRow } from '@/state/dataStore'
import { useAppAuth } from '@/state/AppContext'
import { useWorkspaceLease } from '@/state/useWorkspaceLease'
import { JoinType, type TransformDef } from '@/types'
import { getEngine } from '@/engine/EngineAdapter'
import { getTableData } from '@/engine/tableDataService'
import { analyzeMatch, findBestKeys } from '@/canvas/joinUtils'
import { checkRowCount, checkTableCount, checkTransformOutputSafety, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { beginTableOperation } from '@/state/tableOperationCoordinator'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { getVisibleFocusableElement, isVisibleElement } from '@/components/useDialogFocus'
import { JoinColumnSelect } from './JoinColumnSelect'
import { TransformOutputOptions } from './TransformOutputOptions'
import { TransformTypeControls } from './TransformTypeControls'
import { finalizeCombinedTable } from './finalizeCombinedTable'
type TransformModalProps = {
  isOpen: boolean
  /** Hides the combine dialog without unmounting (keeps upgrade prompt alive). */
  onClose: () => void
  /** Fully tears down the modal host after combine + upgrade are both done. */
  onDismiss: () => void
  sourceNodeId: string
  targetNodeId: string
}
const MAX_TABLE_NAME_LENGTH = 100
// Cap preview size so key-selection match checks stay responsive; findBestKeys
// compares every left/right pair against this sample. Full join/append still
// runs over complete tables at creation time.
const MATCH_PREVIEW_SAMPLE_LIMIT = 1_000

export function TransformModal({
  isOpen,
  onClose,
  onDismiss,
  sourceNodeId,
  targetNodeId,
}: TransformModalProps) {
  const nodes = useProjectStore(s => s.nodes)
  const addDerivedTable = useProjectStore(s => s.addDerivedTable)
  const { user } = useAppAuth()
  const { canEdit } = useWorkspaceLease()
  const leftNode = nodes[sourceNodeId]
  const rightNode = nodes[targetNodeId]
  const [joinType, setJoinType] = useState<JoinType>('left')
  const [operation, setOperation] = useState<'join' | 'union'>('join')
  const [leftKey, setLeftKey] = useState('')
  const [rightKey, setRightKey] = useState('')
  const [outputName, setOutputName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [upgradeViolation, setUpgradeViolation] = useState<LimitExceeded | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [leftData, setLeftData] = useState<TableRow[]>([])
  const [rightData, setRightData] = useState<TableRow[]>([])
  const [leftTotalRows, setLeftTotalRows] = useState(0)
  const [rightTotalRows, setRightTotalRows] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string>()
  const [previewRequestKey, setPreviewRequestKey] = useState(0)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const creatingRef = useRef(false)
  const keysTouchedRef = useRef(false)
  const operationFocusRef = useRef<HTMLButtonElement>(null)
  const leftCols = useMemo(() => 
    (leftNode?.kind === 'source_table' || leftNode?.kind === 'derived_table') 
      ? leftNode.schema?.columns ?? [] : []
  , [leftNode])
  const rightCols = useMemo(() => 
    (rightNode?.kind === 'source_table' || rightNode?.kind === 'derived_table') 
      ? rightNode.schema?.columns ?? [] : []
  , [rightNode])
  const allCols = useMemo(() => [
    ...leftCols.map(c => ({
      id: `L:${c.id}`, colId: c.id, name: c.name, type: c.type, side: 'L' as const,
      table: leftNode?.name, sourceTone: leftNode?.kind === 'derived_table' ? 'derived' as const : 'source' as const,
    })),
    ...rightCols.map(c => ({
      id: `R:${c.id}`, colId: c.id, name: c.name, type: c.type, side: 'R' as const,
      table: rightNode?.name, sourceTone: rightNode?.kind === 'derived_table' ? 'derived' as const : 'source' as const,
    }))
  ], [leftCols, rightCols, leftNode?.kind, leftNode?.name, rightNode?.kind, rightNode?.name])
  useEffect(() => {
    if (leftNode && rightNode) setOutputName(`${leftNode.name} + ${rightNode.name}`)
  }, [leftNode, rightNode])
  useEffect(() => {
    setSelected(new Set(allCols.map(c => c.id)))
  }, [allCols])
  useEffect(() => {
    if (!isOpen) return
    keysTouchedRef.current = false
  }, [isOpen, sourceNodeId, targetNodeId])
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(undefined)
    void Promise.all([
      getTableData(sourceNodeId, 0, MATCH_PREVIEW_SAMPLE_LIMIT),
      getTableData(targetNodeId, 0, MATCH_PREVIEW_SAMPLE_LIMIT),
    ]).then(([left, right]) => {
      if (cancelled) return
      setLeftData(left.rows)
      setRightData(right.rows)
      setLeftTotalRows(left.totalRows)
      setRightTotalRows(right.totalRows)
      setPreviewError(left.error || right.error)
    }).catch((error) => {
      if (!cancelled) {
        setPreviewError(error instanceof Error ? error.message : 'Unable to preview join data')
      }
    }).finally(() => {
      if (!cancelled) setPreviewLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, sourceNodeId, targetNodeId, previewRequestKey])
  useEffect(() => {
    if (keysTouchedRef.current) return
    if (leftCols.length && rightCols.length) {
      const best = findBestKeys(leftCols, rightCols, leftData, rightData)
      if (best) { setLeftKey(best.left); setRightKey(best.right) }
      else { setLeftKey(leftCols[0].id); setRightKey(rightCols[0].id) }
    }
  }, [leftCols, rightCols, leftData, rightData])
  const match = useMemo(() => analyzeMatch(leftData, rightData, leftKey, rightKey), [leftData, rightData, leftKey, rightKey])
  const isExactMatch = leftTotalRows <= MATCH_PREVIEW_SAMPLE_LIMIT && rightTotalRows <= MATCH_PREVIEW_SAMPLE_LIMIT
  const canUnion = leftCols.length > 0 && leftCols.length === rightCols.length && leftCols.every(
    (column, index) => column.type === rightCols[index]?.type,
  )
  useEffect(() => {
    if (!leftKey || !rightKey) return
    setSelected((previous) => {
      const next = new Set(previous)
      next.add(`L:${leftKey}`)
      next.add(`R:${rightKey}`)
      return next
    })
  }, [leftKey, rightKey])
  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])
  const closeCombineAndOpenUpgrade = useCallback((violation: LimitExceeded) => {
    setUpgradeViolation(violation)
    onClose()
    setUpgradeOpen(true)
  }, [onClose])
  const handleCreate = useCallback(async () => {
    if (creatingRef.current) return
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
      console.error('[TransformModal] Failed to create table:', error)
      setCreateError(
        error instanceof Error
          ? error.message
          : 'We could not create the combined table. Check the selected columns and try again.',
      )
    } finally {
      creatingRef.current = false
      setIsCreating(false)
    }
  }, [leftKey, rightKey, operation, canUnion, selected, outputName, leftNode, rightNode, sourceNodeId, targetNodeId, joinType, leftCols, rightCols, allCols, addDerivedTable, closeCombineAndOpenUpgrade, onDismiss, nodes, user, leftTotalRows, rightTotalRows])
  const leftOpts = useMemo(
    () => leftCols.map(c => ({ value: c.id, label: c.name, type: c.type })),
    [leftCols],
  )
  const rightOpts = useMemo(
    () => rightCols.map(c => ({ value: c.id, label: c.name, type: c.type })),
    [rightCols],
  )
  const includedColumnCount = allCols.filter(
    (column) => selected.has(column.id) && !(column.side === 'R' && column.colId === rightKey),
  ).length
  const canCreate = canEdit && (operation === 'join'
    ? Boolean(leftKey && rightKey && includedColumnCount > 0)
    : canUnion)
  return (
    <>
      <Dialog.Root
        open={isOpen}
        onOpenChange={open => {
          if (!open && !creatingRef.current) onDismiss()
        }}
      >
        <Dialog.Portal>
        <Dialog.Overlay className="join-overlay z-50" />
        <Dialog.Content
          className="fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-border-elevation bg-surface shadow-2xl motion-safe:animate-scale-in sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            operationFocusRef.current?.focus()
          }}
          onCloseAutoFocus={event => {
            const connectSelect = document.getElementById(`connect-${sourceNodeId}`)
            const returnFocusElement = connectSelect instanceof HTMLElement && isVisibleElement(connectSelect)
              ? connectSelect
              : getVisibleFocusableElement()
            if (!returnFocusElement) return
            event.preventDefault()
            returnFocusElement.focus()
          }}
        >
          <div className="join-header">
            <div className="join-header-text">
              <Dialog.Title asChild>
                <h2>Combine Tables</h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p>Choose how to combine <strong>{leftNode?.name}</strong> and <strong>{rightNode?.name}</strong>.</p>
              </Dialog.Description>
            </div>
          </div>

          <div className="join-body">
            {(!leftNode || !rightNode) && (
              <p className="text-sm text-red-600" role="alert">
                One of these tables is no longer available. Close this dialog and choose two tables again.
              </p>
            )}
            <TransformTypeControls
              operation={operation}
              onOperationChange={setOperation}
              canUnion={canUnion}
              joinType={joinType}
              onJoinTypeChange={setJoinType}
              initialFocusRef={operationFocusRef}
            />

            {operation === 'union' && (
              <div className="rounded-lg bg-accent-green/5 px-3 py-2.5">
                <p className="text-sm font-medium text-text-primary">Rows will be stacked in table order</p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                  Columns stay aligned by position and type. The original tables remain unchanged.
                </p>
              </div>
            )}

            {operation === 'join' && (
              <>
            <section className="join-section">
              <h3>Columns to Match</h3>
              <p className="join-section-help">
                Choose one column from each table to use as the matching key.
              </p>
              <div className="join-keys max-sm:!flex-col max-sm:!items-stretch">
                <div className={`join-key-group ${leftNode?.kind === 'derived_table' ? 'join-key-group-derived' : 'join-key-group-source'}`}>
                  <span className="join-key-label">{leftNode?.name}</span>
                  <JoinColumnSelect
                    value={leftKey}
                    options={leftOpts}
                    onChange={value => {
                      keysTouchedRef.current = true
                      setLeftKey(value)
                    }}
                    placeholder="Select a column"
                    ariaLabel={`${leftNode?.name ?? 'Left table'} match column`}
                  />
                </div>
                <div className="join-key-equals max-sm:!self-center max-sm:!pb-0">=</div>
                <div className={`join-key-group ${rightNode?.kind === 'derived_table' ? 'join-key-group-derived' : 'join-key-group-source'}`}>
                  <span className="join-key-label">{rightNode?.name}</span>
                  <JoinColumnSelect
                    value={rightKey}
                    options={rightOpts}
                    onChange={value => {
                      keysTouchedRef.current = true
                      setRightKey(value)
                    }}
                    placeholder="Select a column"
                    ariaLabel={`${rightNode?.name ?? 'Right table'} match column`}
                  />
                </div>
              </div>
              <div className={`join-match-badge ${
                match.rate === 0 ? 'neutral' : match.rate >= 70 ? 'good' : match.rate >= 30 ? 'warn' : 'bad'
              }`}>
                {previewLoading ? (
                  <>Checking sample rows…</>
                ) : previewError ? (
                  <>
                    Could not preview matches.
                    <button
                      type="button"
                      className="ml-1 font-semibold underline"
                      onClick={() => setPreviewRequestKey((key) => key + 1)}
                    >
                      Try again
                    </button>
                  </>
                ) : match.rate > 0 ? (
                  isExactMatch
                    ? <>{match.rate}% match across all {match.sampleSize} rows</>
                    : <>{match.rate}% match in a sample of {match.sampleSize} rows</>
                ) : (
                  <>No matching values in this {isExactMatch ? 'table' : 'sample'}.</>
                )}
              </div>
            </section>
              </>
            )}

            {createError && (
              <div
                className="rounded-lg bg-error-light px-3 py-2.5 text-sm font-medium leading-relaxed text-error-text"
                role="alert"
              >
                {createError}
              </div>
            )}

            <TransformOutputOptions
              operation={operation}
              columns={allCols}
              selected={selected}
              leftKey={leftKey}
              rightKey={rightKey}
              includedColumnCount={includedColumnCount}
              outputName={outputName}
              maxNameLength={MAX_TABLE_NAME_LENGTH}
              onToggleColumn={toggle}
              onOutputNameChange={name => {
                setOutputName(name)
                setCreateError(undefined)
              }}
            />
          </div>

          <div className="join-footer">
            <span className="join-footer-summary">
              {operation === 'join'
                ? `${includedColumnCount} ${includedColumnCount === 1 ? 'column' : 'columns'} in the result`
                : `${leftCols.length} aligned ${leftCols.length === 1 ? 'column' : 'columns'}`}
            </span>
            <div className="join-footer-actions">
              <Dialog.Close
                className="canvas-touch-target join-btn-cancel"
                disabled={isCreating}
              >
                Cancel
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!canCreate || isCreating}
                className="canvas-touch-target join-btn-create"
              >
                {isCreating
                  ? 'Creating table…'
                  : operation === 'join'
                    ? 'Create joined table'
                    : 'Create appended table'}
              </button>
            </div>
          </div>
        </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <UpgradePrompt
        open={upgradeOpen}
        onOpenChange={(open) => {
          setUpgradeOpen(open)
          if (!open) onDismiss()
        }}
        violation={upgradeViolation}
        layer={isOpen ? 'nested' : 'base'}
      />
    </>
  )
}
