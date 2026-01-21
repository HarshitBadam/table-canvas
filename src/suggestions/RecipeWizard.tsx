/**
 * Recipe Wizard Component
 * Modal wizard for configuring and executing recipe suggestions
 */

import { useState, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '@/state/projectStore'
import type { Suggestion, ColumnSchema, TransformDef } from '@/lib/types'
import { generateId } from '@/lib/utils'

interface RecipeWizardProps {
  isOpen: boolean
  onClose: () => void
  suggestion: Suggestion | null
  onExecute: (transform: TransformDef, tableName: string) => Promise<void>
}

interface RecipeConfig {
  id: string
  title: string
  description: string
  fields: RecipeField[]
  outputs: string[]
  buildTransform: (bindings: Record<string, string>, tableId: string, columns?: ColumnSchema[]) => TransformDef
  getTableName: (tableName: string, bindings: Record<string, string>, columns?: ColumnSchema[]) => string
}

interface RecipeField {
  id: string
  label: string
  type: 'column' | 'select'
  columnType?: 'string' | 'number' | 'date' | 'datetime'
  required: boolean
  hint?: string
  options?: { value: string; label: string }[]
}

// Recipe configurations
const RECIPE_CONFIGS: Record<string, RecipeConfig> = {
  trend_summary: {
    id: 'trend_summary',
    title: 'Trend Analysis',
    description: 'Analyze how values change over time with aggregated summaries.',
    fields: [
      { id: 'dateColumnId', label: 'Date Column', type: 'column', columnType: 'date', required: true, hint: 'The time dimension for grouping' },
      { id: 'valueColumnId', label: 'Value Column', type: 'column', columnType: 'number', required: true, hint: 'The metric to analyze' },
      { id: 'period', label: 'Group By', type: 'select', required: true, options: [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'quarter', label: 'Quarter' },
        { value: 'year', label: 'Year' },
      ]},
    ],
    outputs: ['Summary table with period totals', 'Line chart showing trend'],
    buildTransform: (bindings, tableId, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Value'
      return {
        type: 'group_summarize',
        sourceTableId: tableId,
        groupByColumns: [bindings.dateColumnId],
        aggregations: [
          { columnId: bindings.valueColumnId, operation: 'sum', alias: `Total ${valueName}` },
          { columnId: bindings.valueColumnId, operation: 'avg', alias: `Avg ${valueName}` },
          { columnId: bindings.valueColumnId, operation: 'count', alias: 'Record Count' },
        ],
      }
    },
    getTableName: (tableName, bindings, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Values'
      return `${valueName} Trend`
    },
  },
  contribution: {
    id: 'contribution',
    title: 'Category Contribution',
    description: 'Analyze how each category contributes to the total (Pareto analysis).',
    fields: [
      { id: 'categoryColumnId', label: 'Category Column', type: 'column', columnType: 'string', required: true, hint: 'The dimension to group by' },
      { id: 'valueColumnId', label: 'Value Column', type: 'column', columnType: 'number', required: true, hint: 'The metric to sum' },
    ],
    outputs: ['Summary table ranked by contribution', 'Bar chart showing breakdown', 'Cumulative percentage'],
    buildTransform: (bindings, tableId, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Value'
      return {
        type: 'group_summarize',
        sourceTableId: tableId,
        groupByColumns: [bindings.categoryColumnId],
        aggregations: [
          { columnId: bindings.valueColumnId, operation: 'sum', alias: `Total ${valueName}` },
          { columnId: bindings.valueColumnId, operation: 'count', alias: 'Record Count' },
        ],
      }
    },
    getTableName: (tableName, bindings, columns) => {
      const categoryCol = columns?.find(c => c.id === bindings.categoryColumnId)
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const categoryName = categoryCol?.name || 'Category'
      const valueName = valueCol?.name || 'Value'
      return `${valueName} by ${categoryName}`
    },
  },
  variance_analysis: {
    id: 'variance_analysis',
    title: 'Variance Analysis',
    description: 'Compare actual vs planned/budgeted values with variance calculations.',
    fields: [
      { id: 'actualColumnId', label: 'Actual Column', type: 'column', columnType: 'number', required: true, hint: 'The actual/real values' },
      { id: 'budgetColumnId', label: 'Budget/Plan Column', type: 'column', columnType: 'number', required: true, hint: 'The target/expected values' },
      { id: 'groupByColumnId', label: 'Group By (optional)', type: 'column', columnType: 'string', required: false, hint: 'Optional dimension for grouping' },
    ],
    outputs: ['Variance table (absolute & percentage)', 'Variance chart'],
    buildTransform: (bindings, tableId, columns) => {
      const actualCol = columns?.find(c => c.id === bindings.actualColumnId)
      const budgetCol = columns?.find(c => c.id === bindings.budgetColumnId)
      const actualName = actualCol?.name || 'Actual'
      const budgetName = budgetCol?.name || 'Budget'
      return {
        type: 'calculated_column',
        sourceTableId: tableId,
        newColumnName: `${actualName} vs ${budgetName} Variance`,
        expression: `("${bindings.actualColumnId}" - "${bindings.budgetColumnId}")`,
      }
    },
    getTableName: (tableName, bindings, columns) => {
      const actualCol = columns?.find(c => c.id === bindings.actualColumnId)
      const budgetCol = columns?.find(c => c.id === bindings.budgetColumnId)
      const actualName = actualCol?.name || 'Actual'
      const budgetName = budgetCol?.name || 'Budget'
      return `${actualName} vs ${budgetName} Variance`
    },
  },
  reconciliation: {
    id: 'reconciliation',
    title: 'Reconciliation',
    description: 'Match records between two datasets and identify discrepancies.',
    fields: [
      { id: 'leftTableId', label: 'Left Table', type: 'select', required: true },
      { id: 'rightTableId', label: 'Right Table', type: 'select', required: true },
      { id: 'leftKeyColumn', label: 'Left Key Column', type: 'column', required: true, hint: 'The matching key from left table' },
      { id: 'rightKeyColumn', label: 'Right Key Column', type: 'column', required: true, hint: 'The matching key from right table' },
    ],
    outputs: ['Matched records', 'Unmatched from left', 'Unmatched from right'],
    buildTransform: (bindings) => ({
      type: 'join',
      leftTableId: bindings.leftTableId,
      rightTableId: bindings.rightTableId,
      joinType: 'outer',
      conditions: [{
        leftColumn: bindings.leftKeyColumn,
        rightColumn: bindings.rightKeyColumn,
        operator: 'equals',
      }],
    }),
    getTableName: () => 'Reconciliation Results',
  },
  period_over_period: {
    id: 'period_over_period',
    title: 'Period-over-Period Analysis',
    description: 'Calculate changes between time periods to track growth and trends.',
    fields: [
      { id: 'dateColumnId', label: 'Date Column', type: 'column', columnType: 'date', required: true, hint: 'The time dimension for comparison' },
      { id: 'valueColumnId', label: 'Value Column', type: 'column', columnType: 'number', required: true, hint: 'The metric to compare across periods' },
      { id: 'period', label: 'Period', type: 'select', required: true, options: [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
        { value: 'quarter', label: 'Quarter' },
        { value: 'year', label: 'Year' },
      ]},
    ],
    outputs: ['Table with period comparisons', 'Growth rate calculations'],
    buildTransform: (bindings, tableId, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Value'
      return {
        type: 'group_summarize',
        sourceTableId: tableId,
        groupByColumns: [bindings.dateColumnId],
        aggregations: [
          { columnId: bindings.valueColumnId, operation: 'sum', alias: `Total ${valueName}` },
          { columnId: bindings.valueColumnId, operation: 'avg', alias: `Avg ${valueName}` },
          { columnId: bindings.valueColumnId, operation: 'count', alias: 'Record Count' },
        ],
      }
    },
    getTableName: (tableName, bindings, columns) => {
      const valueCol = columns?.find(c => c.id === bindings.valueColumnId)
      const valueName = valueCol?.name || 'Value'
      const period = bindings.period || 'period'
      return `${valueName} by ${period.charAt(0).toUpperCase() + period.slice(1)}`
    },
  },
}

export function RecipeWizard({ isOpen, onClose, suggestion, onExecute }: RecipeWizardProps) {
  const nodes = useProjectStore((state) => state.nodes)
  const currentTableId = suggestion?.context.tableId
  const currentNode = currentTableId ? nodes[currentTableId] : null
  const schema = currentNode && ('schema' in currentNode) ? currentNode.schema : null
  
  // Get recipe config
  const recipeId = suggestion?.action.kind === 'launchRecipe' ? suggestion.action.recipeId : null
  const recipeConfig = recipeId ? RECIPE_CONFIGS[recipeId] : null
  
  // Initialize bindings from suggestion
  const initialBindings = suggestion?.action.kind === 'launchRecipe' 
    ? suggestion.action.initialBindings ?? {}
    : {}
  
  const [bindings, setBindings] = useState<Record<string, string>>(initialBindings)
  const [isExecuting, setIsExecuting] = useState(false)
  
  // Reset bindings when suggestion changes
  useMemo(() => {
    if (suggestion?.action.kind === 'launchRecipe') {
      setBindings(suggestion.action.initialBindings ?? {})
    }
  }, [suggestion])
  
  // Get columns for column selectors
  const columns = schema?.columns ?? []
  
  // Filter columns by type
  const getColumnsForField = (field: RecipeField): ColumnSchema[] => {
    if (field.type !== 'column') return []
    if (!field.columnType) return columns
    
    if (field.columnType === 'date') {
      return columns.filter(c => c.type === 'date' || c.type === 'datetime')
    }
    return columns.filter(c => c.type === field.columnType)
  }
  
  // Get other tables for reconciliation
  const otherTables = useMemo(() => {
    return Object.values(nodes)
      .filter(n => (n.kind === 'source_table' || n.kind === 'derived_table') && n.id !== currentTableId)
      .map(n => ({ value: n.id, label: n.name }))
  }, [nodes, currentTableId])
  
  // Validation
  const isValid = useMemo(() => {
    if (!recipeConfig) return false
    return recipeConfig.fields
      .filter(f => f.required)
      .every(f => bindings[f.id])
  }, [recipeConfig, bindings])
  
  // Handle field change
  const handleFieldChange = (fieldId: string, value: string) => {
    setBindings(prev => ({ ...prev, [fieldId]: value }))
  }
  
  // Handle execute
  const handleExecute = async () => {
    if (!recipeConfig || !currentTableId || !isValid || !currentNode) return
    
    setIsExecuting(true)
    try {
      const transform = recipeConfig.buildTransform(bindings, currentTableId, columns)
      const tableName = recipeConfig.getTableName(currentNode.name, bindings, columns)
      await onExecute(transform, tableName)
      onClose()
    } catch (error) {
      console.error('Recipe execution failed:', error)
    } finally {
      setIsExecuting(false)
    }
  }
  
  if (!recipeConfig) return null
  
  // Generate preview of what will be created
  const previewTableName = currentNode ? recipeConfig.getTableName(currentNode.name, bindings, columns) : ''
  
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface rounded-2xl shadow-2xl border border-border animate-scale-in z-50 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-semibold text-text-primary">
                {recipeConfig.title}
              </Dialog.Title>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors"
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
          
          {/* Content */}
          <div className="px-6 pb-4 space-y-4">
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
          </div>
          
          {/* Footer with preview and action */}
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
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
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

