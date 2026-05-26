/**
 * FormulaColumnModal
 * Clean professional design
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { ColumnSchema } from '@/types'
import {
  suggestFormulasFromName,
  inferFormulaType,
  validateFormulaWithColumns,
  FormulaSuggestion,
  FormulaValue,
  getFunctionsByCategory,
} from '@/formula'

interface FormulaColumnModalProps {
  isOpen: boolean
  insertIndex: number
  columns: ColumnSchema[]
  rows: Array<Record<string, FormulaValue>>
  onConfirm: (
    name: string,
    type: 'string' | 'number' | 'boolean' | 'date',
    formula?: string
  ) => void
  onCancel: () => void
}

export function FormulaColumnModal({
  isOpen,
  insertIndex: _insertIndex,
  columns,
  rows: _rows,
  onConfirm,
  onCancel,
}: FormulaColumnModalProps) {
  const [columnName, setColumnName] = useState('')
  const [isFormula, setIsFormula] = useState(false)
  const [formula, setFormula] = useState('')
  const [staticType, setStaticType] = useState<'string' | 'number' | 'boolean' | 'date'>('string')
  
  const [formulaSuggestions, setFormulaSuggestions] = useState<FormulaSuggestion[]>([])
  const [formulaErrors, setFormulaErrors] = useState<string[]>([])

  const columnInfo = useMemo(() => 
    columns.map(c => ({ id: c.id, name: c.name, type: c.type })),
    [columns]
  )

  const functionCategories = useMemo(() => getFunctionsByCategory(), [])

  useEffect(() => {
    if (isOpen) {
      setColumnName(`Column ${columns.length + 1}`)
      setIsFormula(false)
      setFormula('')
      setStaticType('string')
      setFormulaSuggestions([])
      setFormulaErrors([])
    }
  }, [isOpen, columns.length])

  useEffect(() => {
    if (columnName.trim()) {
      const suggestions = suggestFormulasFromName(columnName, columnInfo)
      setFormulaSuggestions(suggestions)
      // Auto-switch to formula mode if high-confidence suggestion, but don't auto-fill
      if (suggestions.length > 0 && suggestions[0].confidence === 'high') {
        setIsFormula(true)
      }
    } else {
      setFormulaSuggestions([])
    }
  }, [columnName, columnInfo])

  // Debounced validation - only show errors after user stops typing
  useEffect(() => {
    if (!isFormula || !formula.trim()) {
      setFormulaErrors([])
      return
    }
    
    // Clear errors immediately when typing
    setFormulaErrors([])
    
    // Validate after a delay
    const timeout = setTimeout(() => {
      const errors = validateFormulaWithColumns(formula, columnInfo)
      setFormulaErrors(errors.map(e => e.message))
    }, 800)
    
    return () => clearTimeout(timeout)
  }, [isFormula, formula, columnInfo])

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
    if (!columnName.trim()) return
    if (isFormula && formula.trim()) {
      onConfirm(columnName.trim(), inferredType, formula.trim())
    } else {
      onConfirm(columnName.trim(), staticType, undefined)
    }
  }, [columnName, isFormula, formula, inferredType, staticType, onConfirm])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && columnName.trim() && (!isFormula || !formulaErrors.length)) {
      e.preventDefault()
      handleConfirm()
    }
    if (e.key === 'Escape') onCancel()
  }, [columnName, isFormula, formulaErrors, handleConfirm, onCancel])

  const insertIntoFormula = useCallback((text: string) => {
    setFormula(prev => prev + text)
  }, [])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div 
        className={`bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden flex flex-col transition-all duration-200 ${
          isFormula ? 'w-[520px] max-w-[95vw]' : 'w-[380px] max-w-[90vw]'
        }`}
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">New Column</h3>
          <p className="text-xs text-gray-500 mt-0.5">Add a new column to your table</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Column Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Column Name
            </label>
            <input
              type="text"
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-colors"
              placeholder="Enter column name..."
              autoFocus
            />
          </div>

          {/* Type Toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Column Type
            </label>
            <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <button
                type="button"
                onClick={() => setIsFormula(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  !isFormula
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                <span className="font-semibold">T</span>
                Static
              </button>
              <button
                type="button"
                onClick={() => setIsFormula(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isFormula
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                <span className="italic font-serif">fx</span>
                Formula
              </button>
            </div>
          </div>

          {/* Static: Data Type Selection */}
          {!isFormula && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Data Type
              </label>
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      staticType === type.value
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                        : 'bg-gray-50 dark:bg-gray-800 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold ${
                      staticType === type.value
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {type.value === 'string' ? 'T' : type.value === 'number' ? '#' : type.value === 'boolean' ? '?' : 'D'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${
                        staticType === type.value ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {type.label}
                      </div>
                      <div className="text-xs text-gray-500">{type.desc}</div>
                    </div>
                    {staticType === type.value && (
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Formula Mode */}
          {isFormula && (
            <>
              {/* Suggestions */}
              {formulaSuggestions.length > 0 && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800">
                  <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">
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
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 hover:border-emerald-400'
                        }`}
                      >
                        {s.formula}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Formula Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Formula</label>
                  {formula && !formulaErrors.length && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                      Returns {inferredType}
                    </span>
                  )}
                </div>
                <textarea
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder='e.g., [unit_price] * [quantity]'
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 transition-all resize-none ${
                    formulaErrors.length 
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10 focus:ring-red-500/20 focus:border-red-500' 
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-green-500/20 focus:border-green-500'
                  }`}
                  rows={3}
                  spellCheck={false}
                />
                {formulaErrors.length > 0 && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{formulaErrors[0]}</p>
                )}
              </div>

              {/* Columns & Functions Side by Side */}
              <div className="flex gap-3" style={{ height: '200px' }}>
                {/* Columns Panel */}
                <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Columns</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-1.5">
                    {columnInfo.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => insertIntoFormula(`[${col.name}]`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-white dark:hover:bg-gray-700 transition-colors group"
                      >
                        <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
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

                {/* Functions Panel */}
                <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Functions</span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {Object.entries(functionCategories).map(([category, funcs]) => (
                      funcs.length > 0 && (
                        <div key={category}>
                          <div className="px-3 py-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                            {category}
                          </div>
                          {funcs.map((fn) => (
                            <button
                              key={fn.name}
                              type="button"
                              onClick={() => insertIntoFormula(`${fn.name}(`)}
                              className="w-full px-3 py-1.5 text-left hover:bg-white dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="text-xs font-mono font-semibold text-green-600 dark:text-green-500">
                                {fn.name}
                              </div>
                              <div className="text-[10px] text-gray-500 leading-tight">
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
        
        {/* Footer */}
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
            disabled={!columnName.trim() || (isFormula && formulaErrors.length > 0)}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-accent-green hover:bg-accent-green-hover rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add Column
          </button>
        </div>
      </div>
    </div>
  )
}
