/**
 * FormulaEditor
 * Rich text editor for formulas with syntax highlighting and autocomplete
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { getAutocompleteItems, AutocompleteItem, getFunctionsByCategory } from '@/formula'

interface ColumnInfo {
  id: string
  name: string
  type: string
}

interface FormulaEditorProps {
  value: string
  onChange: (value: string) => void
  columns: ColumnInfo[]
  placeholder?: string
  errors?: string[]
}

export function FormulaEditor({
  value,
  onChange,
  columns,
  placeholder = 'Enter formula...',
  errors = [],
}: FormulaEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [autocompleteType, setAutocompleteType] = useState<'column' | 'function' | 'all'>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [showFunctionPicker, setShowFunctionPicker] = useState(false)
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  // Get autocomplete items
  const autocompleteItems = useMemo(() => {
    return getAutocompleteItems(columns, autocompleteFilter, autocompleteType)
  }, [columns, autocompleteFilter, autocompleteType])

  // Get function categories for picker
  const functionCategories = useMemo(() => getFunctionsByCategory(), [])

  // Detect what kind of autocomplete to show based on cursor context
  const detectAutocompleteContext = useCallback((text: string, position: number) => {
    // Look backwards from cursor
    let i = position - 1
    let currentWord = ''
    
    while (i >= 0 && /[a-zA-Z_]/.test(text[i])) {
      currentWord = text[i] + currentWord
      i--
    }

    // Check if we're inside a column reference
    const beforeCursor = text.substring(0, position)
    const lastOpenBracket = beforeCursor.lastIndexOf('[')
    const lastCloseBracket = beforeCursor.lastIndexOf(']')
    
    if (lastOpenBracket > lastCloseBracket) {
      // Inside column reference
      const columnName = beforeCursor.substring(lastOpenBracket + 1)
      return { type: 'column' as const, filter: columnName }
    }

    // Check if typing a function name
    if (currentWord.length > 0 && currentWord === currentWord.toUpperCase()) {
      return { type: 'function' as const, filter: currentWord }
    }

    // Check if after opening bracket
    if (i >= 0 && text[i] === '[') {
      return { type: 'column' as const, filter: currentWord }
    }

    return { type: 'all' as const, filter: currentWord }
  }, [])

  // Handle input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const position = e.target.selectionStart || 0
    
    onChange(newValue)
    setCursorPosition(position)

    // Detect autocomplete context
    const context = detectAutocompleteContext(newValue, position)
    
    if (context.filter.length > 0 || newValue[position - 1] === '[') {
      setAutocompleteType(context.type)
      setAutocompleteFilter(context.filter)
      setShowAutocomplete(true)
      setSelectedIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }, [onChange, detectAutocompleteContext])

  // Handle autocomplete selection
  const handleAutocompleteSelect = useCallback((item: AutocompleteItem) => {
    const input = inputRef.current
    if (!input) return

    const text = value
    const position = cursorPosition

    // Find the start of what we're replacing
    let start = position
    const context = detectAutocompleteContext(text, position)
    
    if (context.type === 'column') {
      // Find the opening bracket
      const beforeCursor = text.substring(0, position)
      const lastOpenBracket = beforeCursor.lastIndexOf('[')
      if (lastOpenBracket >= 0) {
        start = lastOpenBracket
      }
    } else {
      // Find the start of the current word
      while (start > 0 && /[a-zA-Z_]/.test(text[start - 1])) {
        start--
      }
    }

    const before = text.substring(0, start)
    const after = text.substring(position)
    const newValue = before + item.value + after
    
    onChange(newValue)
    setShowAutocomplete(false)

    // Focus and position cursor
    setTimeout(() => {
      if (input) {
        input.focus()
        const newPosition = start + item.value.length
        input.setSelectionRange(newPosition, newPosition)
      }
    }, 0)
  }, [value, cursorPosition, detectAutocompleteContext, onChange])

  // Handle keyboard navigation in autocomplete
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete && autocompleteItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => 
          prev < autocompleteItems.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => 
          prev > 0 ? prev - 1 : autocompleteItems.length - 1
        )
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        handleAutocompleteSelect(autocompleteItems[selectedIndex])
      } else if (e.key === 'Escape') {
        setShowAutocomplete(false)
      }
    }
  }, [showAutocomplete, autocompleteItems, selectedIndex, handleAutocompleteSelect])

  // Insert text at cursor position
  const insertAtCursor = useCallback((text: string) => {
    const input = inputRef.current
    if (!input) return

    const start = input.selectionStart || 0
    const end = input.selectionEnd || 0
    const before = value.substring(0, start)
    const after = value.substring(end)
    
    const newValue = before + text + after
    onChange(newValue)

    // Focus and position cursor
    setTimeout(() => {
      if (input) {
        input.focus()
        const newPosition = start + text.length
        input.setSelectionRange(newPosition, newPosition)
      }
    }, 0)
  }, [value, onChange])

  // Handle column picker selection
  const handleColumnSelect = useCallback((col: ColumnInfo) => {
    insertAtCursor(`[${col.name}]`)
    setShowColumnPicker(false)
  }, [insertAtCursor])

  // Handle function picker selection
  const handleFunctionSelect = useCallback((funcName: string) => {
    insertAtCursor(`${funcName}(`)
    setShowFunctionPicker(false)
  }, [insertAtCursor])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showAutocomplete || showColumnPicker || showFunctionPicker) {
        const target = e.target as HTMLElement
        if (!target.closest('.formula-editor-container')) {
          setShowAutocomplete(false)
          setShowColumnPicker(false)
          setShowFunctionPicker(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAutocomplete, showColumnPicker, showFunctionPicker])

  // Render highlighted formula (for display layer)
  const highlightedFormula = useMemo(() => {
    if (!value) return null

    const parts: JSX.Element[] = []
    let i = 0
    let key = 0

    while (i < value.length) {
      // Column reference
      if (value[i] === '[') {
        const end = value.indexOf(']', i)
        if (end > i) {
          const columnRef = value.substring(i, end + 1)
          parts.push(
            <span key={key++} className="text-blue-600 dark:text-blue-400">
              {columnRef}
            </span>
          )
          i = end + 1
          continue
        }
      }

      // String literal
      if (value[i] === '"' || value[i] === "'") {
        const quote = value[i]
        let end = i + 1
        while (end < value.length && value[end] !== quote) {
          if (value[end] === '\\') end++
          end++
        }
        const str = value.substring(i, end + 1)
        parts.push(
          <span key={key++} className="text-amber-600 dark:text-amber-400">
            {str}
          </span>
        )
        i = end + 1
        continue
      }

      // Number
      if (/[0-9]/.test(value[i]) || (value[i] === '.' && i + 1 < value.length && /[0-9]/.test(value[i + 1]))) {
        let end = i
        while (end < value.length && /[0-9.]/.test(value[end])) end++
        const num = value.substring(i, end)
        parts.push(
          <span key={key++} className="text-purple-600 dark:text-purple-400">
            {num}
          </span>
        )
        i = end
        continue
      }

      // Function name (uppercase letters)
      if (/[A-Z]/.test(value[i])) {
        let end = i
        while (end < value.length && /[A-Z_0-9]/.test(value[end])) end++
        const func = value.substring(i, end)
        parts.push(
          <span key={key++} className="text-green-600 dark:text-green-400 font-medium">
            {func}
          </span>
        )
        i = end
        continue
      }

      // Operators
      if (/[+\-*/%^=<>!]/.test(value[i])) {
        let end = i
        while (end < value.length && /[+\-*/%^=<>!]/.test(value[end])) end++
        const op = value.substring(i, end)
        parts.push(
          <span key={key++} className="text-red-500 dark:text-red-400">
            {op}
          </span>
        )
        i = end
        continue
      }

      // Other characters
      parts.push(<span key={key++}>{value[i]}</span>)
      i++
    }

    return parts
  }, [value])

  return (
    <div className="formula-editor-container relative">
      {/* Editor with syntax highlighting */}
      <div className="relative">
        {/* Highlighted display layer */}
        <div 
          className="absolute inset-0 px-4 py-3 text-sm font-mono pointer-events-none overflow-hidden whitespace-pre-wrap break-words"
          style={{ color: 'transparent' }}
        >
          {highlightedFormula}
        </div>
        
        {/* Actual textarea */}
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full px-4 py-3 rounded-lg border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none bg-transparent ${
            errors.length > 0 
              ? 'border-red-500 bg-red-50/50 dark:bg-red-900/20' 
              : 'border-border bg-white dark:bg-gray-800'
          } text-transparent caret-text-primary`}
          rows={3}
          style={{ caretColor: 'inherit' }}
          spellCheck={false}
        />

        {/* Visible text layer for caret color */}
        <div 
          className="absolute inset-0 px-4 py-3 text-sm font-mono pointer-events-none overflow-hidden whitespace-pre-wrap break-words text-text-primary"
        >
          {highlightedFormula || <span className="text-gray-400">{placeholder}</span>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-text-tertiary font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
          fx
        </span>
        
        <button
          type="button"
          onClick={() => {
            setShowColumnPicker(!showColumnPicker)
            setShowFunctionPicker(false)
          }}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            showColumnPicker
              ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-600 dark:text-green-400'
              : 'bg-white dark:bg-gray-800 border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          Columns ▾
        </button>
        
        <button
          type="button"
          onClick={() => {
            setShowFunctionPicker(!showFunctionPicker)
            setShowColumnPicker(false)
          }}
          className={`text-xs px-3 py-1 rounded border transition-colors ${
            showFunctionPicker
              ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-600 dark:text-green-400'
              : 'bg-white dark:bg-gray-800 border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          Functions ▾
        </button>

        <div className="flex-1" />

        <span className="text-[10px] text-text-tertiary">
          Type [ for columns, or function names for autocomplete
        </span>
      </div>

      {/* Autocomplete dropdown */}
      {showAutocomplete && autocompleteItems.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-surface border border-border rounded-lg shadow-lg">
          {autocompleteItems.slice(0, 10).map((item, idx) => (
            <button
              key={`${item.type}-${item.label}`}
              type="button"
              onClick={() => handleAutocompleteSelect(item)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                idx === selectedIndex
                  ? 'bg-green-50 dark:bg-green-900/30 text-text-primary'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-text-secondary'
              }`}
            >
              <span className={`w-6 text-center text-xs font-mono rounded px-1 ${
                item.type === 'column'
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                  : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
              }`}>
                {item.type === 'column' ? '[ ]' : 'fn'}
              </span>
              <span className="font-medium">{item.label}</span>
              {item.description && (
                <span className="text-xs text-text-tertiary ml-auto truncate max-w-[200px]">
                  {item.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Column Picker */}
      {showColumnPicker && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-surface border border-border rounded-lg shadow-lg">
          <div className="p-2 border-b border-border text-xs font-medium text-text-secondary">
            Available Columns
          </div>
          {columns.length === 0 ? (
            <div className="px-3 py-4 text-sm text-text-tertiary text-center">
              No columns available
            </div>
          ) : (
            columns.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => handleColumnSelect(col)}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="w-6 text-center text-xs font-mono bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded px-1">
                  {col.type === 'number' ? '#' : col.type === 'boolean' ? '?' : col.type === 'date' ? 'D' : 'T'}
                </span>
                <span className="font-medium text-text-primary">{col.name}</span>
                <span className="text-xs text-text-tertiary ml-auto">{col.type}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Function Picker */}
      {showFunctionPicker && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-auto bg-surface border border-border rounded-lg shadow-lg">
          {Object.entries(functionCategories).map(([category, funcs]) => (
            funcs.length > 0 && (
              <div key={category}>
                <div className="px-3 py-2 text-xs font-medium text-text-secondary uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 border-b border-border sticky top-0">
                  {category}
                </div>
                {funcs.map((func) => (
                  <button
                    key={func.name}
                    type="button"
                    onClick={() => handleFunctionSelect(func.name)}
                    className="w-full px-3 py-2 text-left text-sm flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-border/50"
                  >
                    <span className="font-mono font-medium text-green-600 dark:text-green-400 w-20 flex-shrink-0">
                      {func.name}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary text-xs">{func.description}</div>
                      <div className="text-[10px] text-text-tertiary font-mono mt-0.5">{func.syntax}</div>
                    </div>
                  </button>
                ))}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
