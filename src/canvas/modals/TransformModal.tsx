import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import type { TableRow } from '@/state/dataStore'
import { useAppAuth } from '@/state/AppContext'
import { JoinType } from '@/types'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { getTableData } from '@/engine/tableDataService'
import { analyzeMatch, findBestKeys } from '@/canvas/joinUtils'
import { checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { getVisibleFocusableElement, isVisibleElement } from '@/components/useDialogFocus'
import { JoinColumnSelect } from './JoinColumnSelect'
import { TransformOutputOptions } from './TransformOutputOptions'
import { TransformTypeControls } from './TransformTypeControls'

interface TransformModalProps {
  isOpen: boolean
  onClose: () => void
  sourceNodeId: string
  targetNodeId: string
}

const MAX_TABLE_NAME_LENGTH = 100

export function TransformModal({ isOpen, onClose, sourceNodeId, targetNodeId }: TransformModalProps) {
  const nodes = useProjectStore(s => s.nodes)
  const addDerivedTable = useProjectStore(s => s.addDerivedTable)
  const { user } = useAppAuth()

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
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string>()
  const [previewRequestKey, setPreviewRequestKey] = useState(0)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const creatingRef = useRef(false)
  const keysTouchedRef = useRef(false)

  const leftCols = useMemo(() => 
    (leftNode?.kind === 'source_table' || leftNode?.kind === 'derived_table') 
      ? leftNode.schema?.columns ?? [] : []
  , [leftNode])

  const rightCols = useMemo(() => 
    (rightNode?.kind === 'source_table' || rightNode?.kind === 'derived_table') 
      ? rightNode.schema?.columns ?? [] : []
  , [rightNode])

  const allCols = useMemo(() => [
    ...leftCols.map(c => ({ id: `L:${c.id}`, colId: c.id, name: c.name, type: c.type, side: 'L' as const, table: leftNode?.name })),
    ...rightCols.map(c => ({ id: `R:${c.id}`, colId: c.id, name: c.name, type: c.type, side: 'R' as const, table: rightNode?.name }))
  ], [leftCols, rightCols, leftNode?.name, rightNode?.name])

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
      getTableData(sourceNodeId, 0, 1_000),
      getTableData(targetNodeId, 0, 1_000),
    ]).then(([left, right]) => {
      if (cancelled) return
      setLeftData(left.rows)
      setRightData(right.rows)
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
      setUpgradeViolation(tableCheck)
      setUpgradeOpen(true)
      return
    }

    const lCols = allCols.filter(c => c.side === 'L' && selected.has(c.id)).map(c => c.colId)
    const rCols = allCols.filter(c => c.side === 'R' && selected.has(c.id) && c.colId !== rightKey).map(c => c.colId)

    creatingRef.current = true
    setIsCreating(true)
    setCreateError(undefined)
    let id: string | null = null

    try {
      id = addDerivedTable({
        name: outputName.trim() || `${leftNode?.name} + ${rightNode?.name}`,
        transformDef: operation === 'union'
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
            },
        upstreamNodeIds: [sourceNodeId, targetNodeId],
      })
      const result = await ensureTableMaterialized(id)
      if (result.status === 'error') {
        throw new Error(result.error || 'The table could not be computed.')
      }
      onClose()
    } catch (error) {
      if (id) useProjectStore.getState().deleteNode(id)
      console.error('[TransformModal] Failed to create table:', error)
      setCreateError('We could not create the combined table. Check the selected columns and try again.')
    } finally {
      creatingRef.current = false
      setIsCreating(false)
    }
  }, [leftKey, rightKey, operation, canUnion, selected, outputName, leftNode, rightNode, sourceNodeId, targetNodeId, joinType, leftCols, rightCols, allCols, addDerivedTable, onClose, nodes, user])

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
  const canCreate = operation === 'join'
    ? Boolean(leftKey && rightKey && includedColumnCount > 0)
    : canUnion

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={open => {
        if (!open && !creatingRef.current) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="join-overlay" />
        <Dialog.Content
          className="join-modal w-[min(520px,calc(100vw-2rem))]"
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
          <div className="join-header !gap-3 !px-4 !py-4 sm:!px-6">
            <div className="join-header-text">
              <Dialog.Title asChild>
                <h2>Combine Tables</h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p>Choose how to combine <strong>{leftNode?.name}</strong> and <strong>{rightNode?.name}</strong>.</p>
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="canvas-touch-target join-close focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Close combine tables"
              disabled={isCreating}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </Dialog.Close>
          </div>

          <div className="join-body !gap-6 !p-4 sm:!p-6">
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
            />

            {operation === 'join' && (
              <>
            <section className="join-section">
              <h3>Columns to Match</h3>
              <div className="join-keys max-sm:!flex-col max-sm:!items-stretch">
                <div className="join-key-group">
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
                <div className="join-key-group">
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
              <div className={`join-match-badge ${match.rate >= 70 ? 'good' : match.rate >= 30 ? 'warn' : 'bad'}`}>
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
                  <>{match.rate}% match - {match.rows} rows</>
                ) : (
                  <>No values match. Try different columns.</>
                )}
              </div>
            </section>
              </>
            )}

            {createError && (
              <p className="text-sm text-red-600" role="alert">
                {createError}
              </p>
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

          <div className="join-footer !gap-3 !p-4 sm:!px-6">
            <Dialog.Close
              className="canvas-touch-target join-btn-cancel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              disabled={isCreating}
            >
              Cancel
            </Dialog.Close>
            <button 
              type="button"
              onClick={() => void handleCreate()}
              disabled={!canCreate || isCreating}
              className="canvas-touch-target join-btn-create focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {isCreating
                ? 'Creating table…'
                : operation === 'join'
                  ? 'Create joined table'
                  : 'Create appended table'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <UpgradePrompt
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        violation={upgradeViolation}
      />
    </Dialog.Root>
  )
}
