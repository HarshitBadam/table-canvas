import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import { useDataStore } from '@/state/dataStore'
import { JoinType, ColumnSchema, CellValue } from '@/types'
import { ensureTableMaterialized } from '@/engine/materializationService'

interface TransformModalProps {
  isOpen: boolean
  onClose: () => void
  sourceNodeId: string
  targetNodeId: string
}


function ColumnSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string
  options: { value: string; label: string; type: string }[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find(o => o.value === value)

  const filtered = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, search])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div ref={ref} className="join-select">
      <button type="button" onClick={() => setOpen(!open)} className="join-select-btn">
        {selected ? (
          <>
            <span className="join-select-value">{selected.label}</span>
            <span className="join-select-type">{selected.type}</span>
          </>
        ) : (
          <span className="join-select-placeholder">{placeholder}</span>
        )}
        <svg className="join-select-arrow" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z"/>
        </svg>
      </button>
      
      {open && (
        <div className="join-select-popup">
          <div className="join-select-search-wrap">
            <svg className="join-select-search-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l2.79 2.79a.75.75 0 11-1.06 1.06l-2.79-2.79z"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search columns..."
              className="join-select-search"
            />
          </div>
          <div className="join-select-list">
            {filtered.length === 0 ? (
              <div className="join-select-empty">No columns found</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); setSearch('') }}
                  className={`join-select-option ${value === opt.value ? 'selected' : ''}`}
                >
                  <span className="join-select-option-name">{opt.label}</span>
                  <span className="join-select-option-type">{opt.type}</span>
                  {value === opt.value && (
                    <svg className="join-select-check" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}


function analyzeMatch(
  leftData: Record<string, CellValue>[],
  rightData: Record<string, CellValue>[],
  leftKey: string,
  rightKey: string
) {
  if (!leftKey || !rightKey || !leftData.length || !rightData.length) {
    return { rows: 0, rate: 0 }
  }
  const leftVals = leftData.map(r => r[leftKey]).filter(v => v != null)
  const rightSet = new Set(rightData.map(r => r[rightKey]).filter(v => v != null).map(String))
  const matches = leftVals.filter(v => rightSet.has(String(v))).length
  return {
    rows: matches || leftData.length,
    rate: leftVals.length ? Math.round((matches / leftVals.length) * 100) : 0
  }
}

function findBestKeys(
  leftCols: ColumnSchema[],
  rightCols: ColumnSchema[],
  leftData: Record<string, CellValue>[],
  rightData: Record<string, CellValue>[]
) {
  let best: { left: string; right: string; score: number } | null = null
  for (const lc of leftCols) {
    for (const rc of rightCols) {
      const ln = lc.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const rn = rc.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const nameScore = ln === rn ? 100 : ln.includes(rn) || rn.includes(ln) ? 50 : 0
      const { rate } = analyzeMatch(leftData, rightData, lc.id, rc.id)
      const score = nameScore * 0.3 + rate * 0.7
      if (!best || score > best.score) best = { left: lc.id, right: rc.id, score }
    }
  }
  return best && best.score > 15 ? best : null
}


export function TransformModal({ isOpen, onClose, sourceNodeId, targetNodeId }: TransformModalProps) {
  const nodes = useProjectStore(s => s.nodes)
  const addDerivedTable = useProjectStore(s => s.addDerivedTable)
  const tableData = useDataStore(s => s.tableData)

  const leftNode = nodes[sourceNodeId]
  const rightNode = nodes[targetNodeId]

  const [joinType, setJoinType] = useState<JoinType>('left')
  const [leftKey, setLeftKey] = useState('')
  const [rightKey, setRightKey] = useState('')
  const [outputName, setOutputName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const leftCols = useMemo(() => 
    (leftNode?.kind === 'source_table' || leftNode?.kind === 'derived_table') 
      ? leftNode.schema?.columns ?? [] : []
  , [leftNode])

  const rightCols = useMemo(() => 
    (rightNode?.kind === 'source_table' || rightNode?.kind === 'derived_table') 
      ? rightNode.schema?.columns ?? [] : []
  , [rightNode])

  const leftData = tableData[sourceNodeId]?.rows ?? []
  const rightData = tableData[targetNodeId]?.rows ?? []

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
    if (leftCols.length && rightCols.length) {
      const best = findBestKeys(leftCols, rightCols, leftData, rightData)
      if (best) { setLeftKey(best.left); setRightKey(best.right) }
      else { setLeftKey(leftCols[0].id); setRightKey(rightCols[0].id) }
    }
  }, [leftCols, rightCols, leftData, rightData])

  const match = useMemo(() => analyzeMatch(leftData, rightData, leftKey, rightKey), [leftData, rightData, leftKey, rightKey])

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
    if (!leftKey || !rightKey) return
    const lCols = allCols.filter(c => c.side === 'L' && selected.has(c.id)).map(c => c.colId)
    const rCols = allCols.filter(c => c.side === 'R' && selected.has(c.id) && c.colId !== rightKey).map(c => c.colId)

    const id = addDerivedTable({
      name: outputName || `${leftNode?.name} + ${rightNode?.name}`,
      transformDef: {
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
  }, [leftKey, rightKey, selected, outputName, leftNode, rightNode, sourceNodeId, targetNodeId, joinType, leftCols, rightCols, allCols, addDerivedTable, onClose])

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
        <Dialog.Content className="join-modal">
          {/* Header */}
          <div className="join-header">
            <div className="join-header-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="12" r="5"/>
                <circle cx="15" cy="12" r="5"/>
              </svg>
            </div>
            <div className="join-header-text">
              <h2>Join Tables</h2>
              <p>Combine <strong>{leftNode?.name}</strong> with <strong>{rightNode?.name}</strong></p>
            </div>
            <Dialog.Close className="join-close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="join-body">
            {/* Join Type */}
            <section className="join-section">
              <h3>Join Type</h3>
              <div className="join-types">
                {joinTypes.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setJoinType(t.value)}
                    className={`join-type-card ${joinType === t.value ? 'active' : ''}`}
                  >
                    <span className="join-type-name">{t.label}</span>
                    <span className="join-type-desc">{t.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Match Keys */}
            <section className="join-section">
              <h3>Match Columns</h3>
              <div className="join-keys">
                <div className="join-key-group">
                  <label>{leftNode?.name}</label>
                  <ColumnSelect
                    value={leftKey}
                    options={leftOpts}
                    onChange={setLeftKey}
                    placeholder="Select column..."
                  />
                </div>
                <div className="join-key-equals">=</div>
                <div className="join-key-group">
                  <label>{rightNode?.name}</label>
                  <ColumnSelect
                    value={rightKey}
                    options={rightOpts}
                    onChange={setRightKey}
                    placeholder="Select column..."
                  />
                </div>
              </div>
              <div className={`join-match-badge ${match.rate >= 70 ? 'good' : match.rate >= 30 ? 'warn' : 'bad'}`}>
                {match.rate > 0 ? (
                  <>{match.rate}% match · {match.rows} rows</>
                ) : (
                  <>No matching values found</>
                )}
              </div>
            </section>

            {/* Columns */}
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

            {/* Output Name */}
            <section className="join-section">
              <h3>Output Table Name</h3>
              <input
                type="text"
                value={outputName}
                onChange={e => setOutputName(e.target.value)}
                className="join-name-input"
                placeholder="Enter a name..."
              />
            </section>
          </div>

          {/* Footer */}
          <div className="join-footer">
            <Dialog.Close className="join-btn-cancel">Cancel</Dialog.Close>
            <button 
              onClick={handleCreate} 
              disabled={!leftKey || !rightKey}
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
    </Dialog.Root>
  )
}
