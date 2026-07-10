import { useState, useMemo, useEffect } from 'react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import { RECIPE_CONFIGS } from './recipeConfigs'
import type { RecipeField } from './recipeConfigs'
import type { Suggestion, ColumnSchema, TransformDef } from '@/types'

interface RecipeWizardProps {
  isOpen: boolean
  onClose: () => void
  suggestion: Suggestion | null
  onExecute: (transform: TransformDef, tableName: string) => Promise<void>
}

export function RecipeWizard({ isOpen, onClose, suggestion, onExecute }: RecipeWizardProps) {
  const nodes = useProjectStore((state) => state.nodes)
  const currentTableId = suggestion?.context.tableId
  const currentNode = currentTableId ? nodes[currentTableId] : null
  const schema = currentNode && ('schema' in currentNode) ? currentNode.schema : null
  
  const recipeId = suggestion?.action.kind === 'launchRecipe' ? suggestion.action.recipeId : null
  const recipeConfig = recipeId ? RECIPE_CONFIGS[recipeId] : null
  
  const initialBindings = suggestion?.action.kind === 'launchRecipe' 
    ? (suggestion.action.initialBindings as Record<string, string> | undefined) ?? {}
    : {}
  
  const [bindings, setBindings] = useState<Record<string, string>>(initialBindings)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionError, setExecutionError] = useState<string | null>(null)
  
  // Reset bindings whenever the wizard opens for a different suggestion. Seed defaults
  // for option-backed selects (e.g. the period dropdown) so required-field validation
  // passes without forcing the user to re-pick a value that's already displayed.
  useEffect(() => {
    if (suggestion?.action.kind !== 'launchRecipe') return
    const config = RECIPE_CONFIGS[suggestion.action.recipeId]
    const seeded: Record<string, string> = {}
    config?.fields.forEach((field) => {
      if (field.type === 'select' && field.options && field.options.length > 0) {
        seeded[field.id] = field.options[0].value
      }
    })
    const initial = (suggestion.action.initialBindings as Record<string, string> | undefined) ?? {}
    setBindings({ ...seeded, ...initial })
    setExecutionError(null)
  }, [suggestion])
  
  const columns = schema?.columns ?? []
  
  const getColumnsForField = (field: RecipeField): ColumnSchema[] => {
    if (field.type !== 'column') return []

    // Key-column fields in multi-table recipes (e.g. reconciliation) must offer columns
    // from the table picked in another field, not the table the wizard was launched from.
    let sourceColumns = columns
    if (field.sourceTableField) {
      const boundTableId = bindings[field.sourceTableField]
      const boundNode = boundTableId ? nodes[boundTableId] : null
      sourceColumns = boundNode && 'schema' in boundNode ? (boundNode.schema?.columns ?? []) : []
    }

    if (!field.columnType) return sourceColumns
    if (field.columnType === 'date') {
      return sourceColumns.filter(c => c.type === 'date' || c.type === 'datetime')
    }
    return sourceColumns.filter(c => c.type === field.columnType)
  }
  
  const otherTables = useMemo(() => {
    return Object.values(nodes)
      .filter(n => (n.kind === 'source_table' || n.kind === 'derived_table') && n.id !== currentTableId)
      .map(n => ({ value: n.id, label: n.name }))
  }, [nodes, currentTableId])
  
  const isValid = useMemo(() => {
    if (!recipeConfig) return false
    return recipeConfig.fields
      .filter(f => f.required)
      .every(f => bindings[f.id])
  }, [recipeConfig, bindings])
  
  const handleFieldChange = (fieldId: string, value: string) => {
    setBindings(prev => ({ ...prev, [fieldId]: value }))
  }
  
  const handleExecute = async () => {
    if (!recipeConfig || !currentTableId || !isValid || !currentNode) return
    
    setIsExecuting(true)
    setExecutionError(null)
    try {
      const transform = recipeConfig.buildTransform(bindings, currentTableId, columns)
      const tableName = recipeConfig.getTableName(currentNode.name, bindings, columns)
      await onExecute(transform, tableName)
      onClose()
    } catch (error) {
      console.error('Recipe execution failed:', error)
      setExecutionError(error instanceof Error ? error.message : 'Could not create recipe output')
    } finally {
      setIsExecuting(false)
    }
  }
  
  if (!recipeConfig) return null
  
  const previewTableName = currentNode ? recipeConfig.getTableName(currentNode.name, bindings, columns) : ''
  
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in z-[60]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-surface rounded-2xl shadow-2xl border border-border animate-scale-in z-[60] overflow-hidden">
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-text-primary">
                {recipeConfig.title}
              </Dialog.Title>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors"
                aria-label="Close recipe"
              >
                <svg className="w-5 h-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <Dialog.Description className="text-sm text-text-secondary mt-1">
              {recipeConfig.description}
            </Dialog.Description>
          </div>
          
          <div className="px-6 pb-4 space-y-4">
            {executionError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
                {executionError}
              </div>
            )}
            {recipeConfig.fields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                
                {field.type === 'column' && (
                  <div className="relative">
                    <select
                      value={bindings[field.id] || ''}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full h-11 px-4 pr-10 rounded-xl border-2 border-border bg-surface text-text-primary text-sm 
                        focus:outline-none focus:border-accent-green transition-colors appearance-none cursor-pointer
                        hover:border-border-hover"
                    >
                      <option value="">Select column...</option>
                      {getColumnsForField(field).map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name} ({col.type})
                        </option>
                      ))}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                )}
                
                {field.type === 'select' && field.options && (
                  <div className="relative">
                    <select
                      value={bindings[field.id] || field.options[0]?.value || ''}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full h-11 px-4 pr-10 rounded-xl border-2 border-border bg-surface text-text-primary text-sm 
                        focus:outline-none focus:border-accent-green transition-colors appearance-none cursor-pointer
                        hover:border-border-hover"
                    >
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                )}
                
                {field.type === 'select' && field.id.includes('TableId') && (
                  <div className="relative">
                    <select
                      value={bindings[field.id] || ''}
                      onChange={(e) => handleFieldChange(field.id, e.target.value)}
                      className="w-full h-11 px-4 pr-10 rounded-xl border-2 border-border bg-surface text-text-primary text-sm 
                        focus:outline-none focus:border-accent-green transition-colors appearance-none cursor-pointer
                        hover:border-border-hover"
                    >
                      <option value="">Select table...</option>
                      {otherTables.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                )}
                
                {field.hint && (
                  <p className="text-xs text-text-tertiary mt-1.5">{field.hint}</p>
                )}
              </div>
            ))}
            <div>
              <p className="text-sm font-medium text-text-primary mb-1.5">Creates</p>
              <ul className="list-disc pl-5 text-xs text-text-secondary space-y-1">
                {recipeConfig.outputs.map((output) => <li key={output}>{output}</li>)}
              </ul>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-surface-secondary/50 border-t border-border">
            {isValid && previewTableName && (
              <p className="text-xs text-text-tertiary mb-3">
                Creates: <span className="font-medium text-text-secondary">{previewTableName}</span>
              </p>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 h-11 px-4 text-sm font-medium text-text-secondary bg-surface border-2 border-border rounded-xl
                  hover:bg-surface-secondary hover:border-border-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={!isValid || isExecuting}
                className="flex-1 h-11 px-4 text-sm font-medium text-white bg-accent-green rounded-xl
                  hover:bg-accent-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all
                  active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isExecuting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Creating...
                  </>
                ) : (
                  `Create ${recipeConfig.title}`
                )}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

