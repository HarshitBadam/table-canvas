import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import { useWorkspaceLease } from '@/state/document/useWorkspaceLease'
import { JoinType } from '@/types'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { getVisibleFocusableElement, isVisibleElement } from '@/components/useDialogFocus'
import { JoinColumnSelect } from './JoinColumnSelect'
import { TransformOutputOptions } from './TransformOutputOptions'
import { TransformTypeControls } from './TransformTypeControls'
import { useTransformPreview } from './useTransformPreview'
import { useTransformCreation } from './useTransformCreation'

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

export function TransformModal({
  isOpen,
  onClose,
  onDismiss,
  sourceNodeId,
  targetNodeId,
}: TransformModalProps) {
  const nodes = useProjectStore(s => s.nodes)
  const { canEdit } = useWorkspaceLease()
  const leftNode = nodes[sourceNodeId]
  const rightNode = nodes[targetNodeId]
  const [joinType, setJoinType] = useState<JoinType>('left')
  const [operation, setOperation] = useState<'join' | 'union'>('join')
  const [outputName, setOutputName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
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

  const {
    leftKey,
    rightKey,
    setLeftKey,
    setRightKey,
    leftTotalRows,
    rightTotalRows,
    previewLoading,
    previewError,
    retryPreview,
    match,
    isExactMatch,
  } = useTransformPreview({ isOpen, sourceNodeId, targetNodeId, leftCols, rightCols })

  const {
    isCreating,
    createError,
    clearCreateError,
    upgradeViolation,
    upgradeOpen,
    setUpgradeOpen,
    create,
  } = useTransformCreation({ onClose, onDismiss })

  useEffect(() => {
    if (leftNode && rightNode) setOutputName(`${leftNode.name} + ${rightNode.name}`)
  }, [leftNode, rightNode])
  useEffect(() => {
    setSelected(new Set(allCols.map(c => c.id)))
  }, [allCols])
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
          if (!open && !isCreating) onDismiss()
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
                    onChange={setLeftKey}
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
                    onChange={setRightKey}
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
                      onClick={retryPreview}
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
                clearCreateError()
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
                onClick={() => void create({
                  operation,
                  joinType,
                  leftKey,
                  rightKey,
                  canUnion,
                  selected,
                  outputName,
                  leftNode,
                  rightNode,
                  sourceNodeId,
                  targetNodeId,
                  leftCols,
                  rightCols,
                  allCols,
                  leftTotalRows,
                  rightTotalRows,
                })}
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
