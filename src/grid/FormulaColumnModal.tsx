import { useState, useCallback, useEffect, useMemo } from 'react'
import { ColumnSchema, type UserColumnType } from '@/types'
import {
  suggestFormulasFromName,
  inferFormulaType,
  validateFormulaWithColumns,
  FormulaSuggestion,
  getFunctionsByCategory,
} from '@/formula'
import { useDialogFocus } from '@/components/useDialogFocus'

interface FormulaColumnModalProps {
  isOpen: boolean
  columns: ColumnSchema[]
  initialColumn?: ColumnSchema
  onConfirm: (
    name: string,
    type: UserColumnType,
    formula?: string
  ) => void | string
  onCancel: () => void
}

export function FormulaColumnModal({
  isOpen,
  columns,
  initialColumn,
  onConfirm,
  onCancel,
}: FormulaColumnModalProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen, onCancel)
  const [columnName, setColumnName] = useState('')
  const [isFormula, setIsFormula] = useState(false)
  const [formula, setFormula] = useState('')
  const [staticType, setStaticType] = useState<UserColumnType>('string')
  const [submissionError, setSubmissionError] = useState('')
  
  const [formulaSuggestions, setFormulaSuggestions] = useState<FormulaSuggestion[]>([])

  const columnInfo = useMemo(() => 
    columns.map(c => ({ id: c.id, name: c.name, type: c.type })),
    [columns]
  )

  const functionCategories = useMemo(() => getFunctionsByCategory(), [])

  useEffect(() => {
    if (isOpen) {
      setColumnName(initialColumn?.name ?? `Column ${columns.length + 1}`)
      setIsFormula(Boolean(initialColumn?.isComputed))
      setFormula(initialColumn?.formula ?? '')
      setStaticType(
        initialColumn?.type === 'number' ||
        initialColumn?.type === 'boolean' ||
        initialColumn?.type === 'date'
          ? initialColumn.type
          : 'string',
      )
      setFormulaSuggestions([])
      setSubmissionError('')
    }
  }, [isOpen, columns.length, initialColumn])

  useEffect(() => {
    if (columnName.trim()) {
      const suggestions = suggestFormulasFromName(columnName, columnInfo)
      setFormulaSuggestions(suggestions)
      if (suggestions.length > 0 && suggestions[0].confidence === 'high') {
        setIsFormula(true)
      }
    } else {
      setFormulaSuggestions([])
    }
  }, [columnName, columnInfo])

  const formulaErrors = useMemo(
    () => isFormula && formula.trim()
      ? validateFormulaWithColumns(formula, columnInfo).map(error => error.message)
      : [],
    [isFormula, formula, columnInfo],
  )

  const columnNameError = useMemo(() => {
    const name = columnName.trim().toLowerCase()
    if (!name) return ''
    return columns.some(
      column => column.id !== initialColumn?.id && column.name.trim().toLowerCase() === name,
    )
      ? `A column named "${columnName.trim()}" already exists.`
      : ''
  }, [columnName, columns, initialColumn?.id])

  const inferredType = useMemo(() => {
    if (!isFormula || !formula.trim()) return staticType
    const type = inferFormulaType(formula, columnInfo)
    return type === 'unknown' ? 'string' : type
  }, [isFormula, formula, columnInfo, staticType])

  const handleSuggestionClick = useCallback((suggestion: FormulaSuggestion) => {
    setIsFormula(true)
    setFormula(suggestion.formula)
  }, [])

  const handleConfirm = useCallback(() => {
    if (!columnName.trim() || columnNameError) return
    if (isFormula && formula.trim()) {
      const currentErrors = validateFormulaWithColumns(formula, columnInfo)
      if (currentErrors.length > 0) return
      setSubmissionError(onConfirm(columnName.trim(), inferredType, formula.trim()) ?? '')
    } else {
      setSubmissionError(onConfirm(columnName.trim(), staticType, undefined) ?? '')
    }
  }, [columnName, columnNameError, isFormula, formula, columnInfo, inferredType, staticType, onConfirm])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleConfirm()
    }
  }, [handleConfirm])

  const insertIntoFormula = useCallback((text: string) => {
    setFormula(prev => prev + text)
  }, [])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="formula-column-title"
        aria-describedby="formula-column-description"
        tabIndex={-1}
        className={`flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-xl bg-white shadow-xl transition-all duration-200 dark:bg-gray-900 ${
          isFormula ? 'w-[520px] max-w-full' : 'w-[380px] max-w-full'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 id="formula-column-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {initialColumn ? 'Edit Formula' : 'New Column'}
          </h3>
          <p id="formula-column-description" className="text-xs text-gray-500 mt-0.5">
            {initialColumn ? `Update the formula for ${initialColumn.name}` : 'Add a new column to your table'}
          </p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label htmlFor="formula-column-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Column Name
            </label>
            <input
              id="formula-column-name"
              type="text"
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              disabled={Boolean(initialColumn)}
              className={`input rounded-lg px-3 py-2 ${columnNameError ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : ''}`}
              placeholder="Enter column name..."
              autoFocus
              aria-invalid={Boolean(columnNameError)}
              aria-describedby={columnNameError ? 'formula-column-name-error' : undefined}
            />
            {columnNameError && (
              <p id="formula-column-name-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                {columnNameError}
              </p>
            )}
          </div>

          {!initialColumn && <div>
            <span className="block text-xs font-medium text-text-secondary mb-1.5">
              Column Type
            </span>
            <div className="flex p-1 bg-surface-secondary rounded-lg">
              <button
                type="button"
                onClick={() => setIsFormula(false)}
                aria-label="Static"
                aria-pressed={!isFormula}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  !isFormula
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className="font-semibold">T</span>
                Static
              </button>
              <button
                type="button"
                onClick={() => setIsFormula(true)}
                aria-label="Formula"
                aria-pressed={isFormula}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isFormula
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span className="font-mono">fx</span>
                Formula
              </button>
            </div>
          </div>}

          {!isFormula && (
            <div>
              <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Data Type
              </span>
              <div className="space-y-1.5">
                {[
                  { value: 'string', label: 'Text', desc: 'Letters, words, sentences' },
                  { value: 'number', label: 'Number', desc: 'Integers, decimals' },
                  { value: 'boolean', label: 'Boolean', desc: 'True or false values' },
                  { value: 'date', label: 'Date', desc: 'Dates and timestamps' },
                ].map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setStaticType(type.value as typeof staticType)}
                    aria-pressed={staticType === type.value}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      staticType === type.value
                        ? 'border border-accent-green/30 bg-accent-green/10'
                        : 'bg-gray-50 dark:bg-gray-800 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold ${
                      staticType === type.value
                        ? 'bg-accent-green text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {type.value === 'string' ? 'T' : type.value === 'number' ? '#' : type.value === 'boolean' ? '?' : 'D'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${
                        staticType === type.value ? 'text-accent-text' : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {type.label}
                      </div>
                      <div className="text-xs text-gray-500">{type.desc}</div>
                    </div>
                    {staticType === type.value && (
                      <svg className="w-5 h-5 text-accent-green" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isFormula && (
            <>
              {formulaSuggestions.length > 0 && (
                <div className="rounded-lg border border-accent-green/20 bg-accent-green/10 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-text">
                    Suggested Formula
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {formulaSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSuggestionClick(s)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-mono transition-all ${
                          formula === s.formula
                            ? 'bg-accent-green text-white'
                            : 'border border-accent-green/30 bg-surface text-accent-text hover:border-accent-green'
                        }`}
                      >
                        {s.formula}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="formula-column-expression" className="text-xs font-medium text-gray-700 dark:text-gray-300">Formula</label>
                  {formula && !formulaErrors.length && (
                    <span className="rounded-full bg-accent-green/10 px-2 py-0.5 text-xs font-medium text-accent-text">
                      Returns {inferredType}
                    </span>
                  )}
                </div>
                <textarea
                  id="formula-column-expression"
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder='e.g., [unit_price] * [quantity]'
                  className={`w-full resize-none rounded-lg border px-3 py-2.5 font-mono text-sm transition-colors ${
                    formulaErrors.length 
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
                      : 'border-border bg-surface'
                  }`}
                  rows={3}
                  spellCheck={false}
                  aria-invalid={formulaErrors.length > 0}
                  aria-describedby={formulaErrors.length > 0 ? 'formula-column-error' : undefined}
                />
                {formulaErrors.length > 0 && (
                  <p id="formula-column-error" role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">{formulaErrors[0]}</p>
                )}
                {submissionError && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">{submissionError}</p>
                )}
              </div>

              <div className="flex gap-3" style={{ height: '200px' }}>
                <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Columns</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-1.5">
                    {columnInfo.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => insertIntoFormula(`[${col.name}]`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-white dark:hover:bg-gray-700 transition-colors group"
                      >
                        <span className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                          col.type === 'number' ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600' :
                          col.type === 'date' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600' :
                          col.type === 'boolean' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600' :
                          'bg-gray-200 dark:bg-gray-700 text-gray-500'
                        }`}>
                          {col.type === 'number' ? '#' : col.type === 'date' ? 'D' : col.type === 'boolean' ? '?' : 'T'}
                        </span>
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{col.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Functions</span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {Object.entries(functionCategories).map(([category, funcs]) => (
                      funcs.length > 0 && (
                        <div key={category}>
                          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                            {category}
                          </div>
                          {funcs.map((fn) => (
                            <button
                              key={fn.name}
                              type="button"
                              onClick={() => insertIntoFormula(`${fn.name}(`)}
                              className="w-full px-3 py-1.5 text-left hover:bg-white dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="font-mono text-xs font-semibold text-accent-text">
                                {fn.name}
                              </div>
                              <div className="text-xs text-gray-500 leading-tight">
                                {fn.description}
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2 bg-gray-50 dark:bg-gray-800/50">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!columnName.trim() || Boolean(columnNameError) || (isFormula && formulaErrors.length > 0)}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-accent-green hover:bg-accent-green-hover rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {initialColumn ? 'Save Formula' : 'Add Column'}
          </button>
        </div>
      </div>
    </div>
  )
}
