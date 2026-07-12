import { useState, useEffect, useMemo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import type { TableRow } from '@/state/dataStore'
import { useAppAuth } from '@/state/AppContext'
import { JoinType } from '@/types'
import { ensureTableMaterialized, getTableData } from '@/engine/materializationService'
import { analyzeMatch, findBestKeys } from '@/canvas/joinUtils'
import { checkTableCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { JoinColumnSelect } from './JoinColumnSelect'

interface TransformModalProps {
  isOpen: boolean
  onClose: () => void
  sourceNodeId: string
  targetNodeId: string
}


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
  }, [isOpen, sourceNodeId, targetNodeId])

  useEffect(() => {
    if (leftCols.length && rightCols.length) {
      const best = findBestKeys(leftCols, rightCols, leftData, rightData)
      if (best) { setLeftKey(best.left); setRightKey(best.right) }
      else { setLeftKey(leftCols[0].id); setRightKey(rightCols[0].id) }
    }
  }, [leftCols, rightCols, leftData, rightData])

  const match = useMemo(() => analyzeMatch(leftData, rightData, leftKey, rightKey), [leftData, rightData, leftKey, rightKey])
  const canUnion = leftCols.length === rightCols.length && leftCols.every(
    (column, index) => column.type === rightCols[index]?.type,
  )

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

  const handleCreate = useCallback(() => {
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

    const id = addDerivedTable({
      name: outputName || `${leftNode?.name} + ${rightNode?.name}`,
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
    ensureTableMaterialized(id).catch(console.error)
    onClose()
  }, [leftKey, rightKey, operation, canUnion, selected, outputName, leftNode, rightNode, sourceNodeId, targetNodeId, joinType, leftCols, rightCols, allCols, addDerivedTable, onClose, nodes, user])

  const leftOpts = leftCols.map(c => ({ value: c.id, label: c.name, type: c.type }))
  const rightOpts = rightCols.map(c => ({ value: c.id, label: c.name, type: c.type }))

  const joinTypes: { value: JoinType; label: string; desc: string }[] = [
    { value: 'left', label: 'Left', desc: 'Keep all from left' },
    { value: 'inner', label: 'Inner', desc: 'Only matches' },
    { value: 'right', label: 'Right', desc: 'Keep all from right' },
    { value: 'full', label: 'Full', desc: 'Keep everything' },
  ]

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="join-overlay" />
        <Dialog.Content className="join-modal w-[min(520px,calc(100vw-2rem))]">
          <div className="join-header">
            <div className="join-header-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="12" r="5"/>
                <circle cx="15" cy="12" r="5"/>
              </svg>
            </div>
            <div className="join-header-text">
              <Dialog.Title asChild>
                <h2>Combine Tables</h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p>Link <strong>{leftNode?.name}</strong> with <strong>{rightNode?.name}</strong></p>
              </Dialog.Description>
            </div>
            <Dialog.Close className="join-close" aria-label="Close combine tables">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </Dialog.Close>
          </div>

          <div className="join-body">
            <section className="join-section">
              <h3>Operation</h3>
              <div className="join-types">
                <button
                  type="button"
                  onClick={() => setOperation('join')}
                  aria-pressed={operation === 'join'}
                  className={`join-type-card ${operation === 'join' ? 'active' : ''}`}
                >
                  <span className="join-type-name">Join</span>
                  <span className="join-type-desc">Match rows by key</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOperation('union')}
                  aria-pressed={operation === 'union'}
                  className={`join-type-card ${operation === 'union' ? 'active' : ''}`}
                >
                  <span className="join-type-name">Append</span>
                  <span className="join-type-desc">Stack compatible rows</span>
                </button>
              </div>
              {operation === 'union' && !canUnion && (
                <p className="text-xs text-red-600 mt-2" role="alert">
                  Append requires the same number of columns in the same type order.
                </p>
              )}
            </section>

            {operation === 'join' && (
              <>
            <section className="join-section">
              <h3>Join Type</h3>
              <div className="join-types">
                {joinTypes.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setJoinType(t.value)}
                    aria-pressed={joinType === t.value}
                    className={`join-type-card ${joinType === t.value ? 'active' : ''}`}
                  >
                    <span className="join-type-name">{t.label}</span>
                    <span className="join-type-desc">{t.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="join-section">
              <h3>Match Columns</h3>
              <div className="join-keys">
                <div className="join-key-group">
                  <span className="join-key-label">{leftNode?.name}</span>
                  <JoinColumnSelect
                    value={leftKey}
                    options={leftOpts}
                    onChange={setLeftKey}
                    placeholder="Select column..."
                    ariaLabel={`${leftNode?.name ?? 'Left table'} match column`}
                  />
                </div>
                <div className="join-key-equals">=</div>
                <div className="join-key-group">
                  <span className="join-key-label">{rightNode?.name}</span>
                  <JoinColumnSelect
                    value={rightKey}
                    options={rightOpts}
                    onChange={setRightKey}
                    placeholder="Select column..."
                    ariaLabel={`${rightNode?.name ?? 'Right table'} match column`}
                  />
                </div>
              </div>
              <div className={`join-match-badge ${match.rate >= 70 ? 'good' : match.rate >= 30 ? 'warn' : 'bad'}`}>
                {previewLoading ? (
                  <>Analyzing sample rows...</>
                ) : previewError ? (
                  <>Preview unavailable — the join can still be created</>
                ) : match.rate > 0 ? (
                  <>{match.rate}% match · {match.rows} rows</>
                ) : (
                  <>No matching values found</>
                )}
              </div>
            </section>
            <section className="join-section">
              <div className="join-section-header">
                <h3>Output Columns</h3>
                <span className="join-cols-badge">{selected.size} of {allCols.length}</span>
              </div>
              <div className="join-cols-grid">
                {allCols.map(col => {
                  const isKey = (col.side === 'L' && col.colId === leftKey) || (col.side === 'R' && col.colId === rightKey)
                  const isRightKey = col.side === 'R' && col.colId === rightKey
                  return (
                    <label
                      key={col.id}
                      className={`join-col-item ${selected.has(col.id) ? 'checked' : ''} ${isRightKey ? 'disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(col.id)}
                        disabled={isRightKey}
                        onChange={() => toggle(col.id)}
                      />
                      <span className="join-col-checkbox">
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2.5 6l2.5 2.5 4.5-5"/>
                        </svg>
                      </span>
                      <span className="join-col-info">
                        <span className="join-col-name">{col.name}</span>
                        <span className={`join-col-source ${col.side === 'L' ? 'left' : 'right'}`}>
                          {col.table}
                        </span>
                      </span>
                      {isKey && <span className="join-col-key-badge">Key</span>}
                    </label>
                  )
                })}
              </div>
            </section>
              </>
            )}

            <section className="join-section">
              <h3>Output Table Name</h3>
              <label className="sr-only" htmlFor="join-output-name">Output table name</label>
              <input
                id="join-output-name"
                type="text"
                value={outputName}
                onChange={e => setOutputName(e.target.value)}
                className="join-name-input"
                placeholder="Enter a name..."
              />
            </section>
          </div>

          <div className="join-footer">
            <Dialog.Close className="join-btn-cancel">Cancel</Dialog.Close>
            <button 
              type="button"
              onClick={handleCreate} 
              disabled={operation === 'join' ? (!leftKey || !rightKey) : !canUnion}
              className="join-btn-create"
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z"/>
              </svg>
              Create Table
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
