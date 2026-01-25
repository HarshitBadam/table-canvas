/**
 * Recipe Templates
 * Pre-built analysis patterns for commerce/finance use cases
 * Updated to use new Suggestion types with scope, confidence, and structured actions
 */

import type { Suggestion, TableSchema, SuggestionContext } from '@/lib/types'
import { generateId } from '@/lib/utils'
import { generateTableVersionHash } from './suggestionsStore'

interface RecipeContext {
  tableId: string
  tableName: string
  schema: TableSchema
  tableVersionHash?: string
}

function getVersionHash(context: RecipeContext): string {
  return context.tableVersionHash ?? generateTableVersionHash(
    context.tableId,
    context.schema.rowCount ?? 0,
    context.schema.columns.length,
    undefined
  )
}

function createSuggestionContext(context: RecipeContext): SuggestionContext {
  return {
    tableId: context.tableId,
    tableVersionHash: getVersionHash(context),
  }
}

/**
 * Trend Analysis Recipe
 * Analyzes values over time periods
 */
export function createTrendRecipe(context: RecipeContext): Suggestion | null {
  const { schema } = context
  
  const dateCol = schema.columns.find(c => c.type === 'date' || c.type === 'datetime')
  const numericCol = schema.columns.find(c => c.type === 'number')
  
  if (!dateCol || !numericCol) return null
  
  return {
    id: generateId(),
    category: 'recipe',
    scope: 'table',
    title: 'Trend Analysis',
    description: `Analyze ${numericCol.name} trends over ${dateCol.name}. Creates a summary by time period.`,
    confidence: 'high',
    context: createSuggestionContext(context),
    why: [
      'Time series analysis helps identify growth patterns',
      'Reveals seasonality and anomalies',
      'Essential for forecasting',
    ],
    impact: {
      kind: 'recipe',
      summary: 'Creates trend table + line chart',
    },
    action: {
      kind: 'launchRecipe',
      recipeId: 'trend_summary',
      initialBindings: {
        dateColumnId: dateCol.id,
        valueColumnId: numericCol.id,
      },
    },
  }
}

/**
 * Category Contribution Recipe
 * Pareto-style analysis of category contributions
 */
export function createContributionRecipe(context: RecipeContext): Suggestion | null {
  const { schema } = context
  
  const categoryCol = schema.columns.find(c => 
    c.type === 'string' && (c.semanticHints?.includes('category') || c.name.toLowerCase().includes('category'))
  ) || schema.columns.find(c => c.type === 'string')
  
  const valueCol = schema.columns.find(c => 
    c.type === 'number' && (
      c.name.toLowerCase().includes('amount') ||
      c.name.toLowerCase().includes('value') ||
      c.name.toLowerCase().includes('revenue') ||
      c.name.toLowerCase().includes('sales')
    )
  ) || schema.columns.find(c => c.type === 'number')
  
  if (!categoryCol || !valueCol) return null
  
  return {
    id: generateId(),
    category: 'recipe',
    scope: 'table',
    title: 'Category Contribution',
    description: `Analyze how each ${categoryCol.name} contributes to total ${valueCol.name}. Ranked by impact.`,
    confidence: 'high',
    context: createSuggestionContext(context),
    why: [
      '80/20 analysis helps focus resources',
      'Identifies high-impact categories',
      'Common business analysis pattern',
    ],
    impact: {
      kind: 'recipe',
      summary: 'Creates Pareto chart + contribution table',
    },
    action: {
      kind: 'launchRecipe',
      recipeId: 'contribution',
      initialBindings: {
        categoryColumnId: categoryCol.id,
        valueColumnId: valueCol.id,
      },
    },
  }
}

/**
 * Variance Analysis Recipe
 * Compares actual vs budget/plan/target
 */
export function createVarianceRecipe(context: RecipeContext): Suggestion | null {
  const { schema } = context
  
  // Look for actual/budget column pairs
  const actualCol = schema.columns.find(c => 
    c.type === 'number' && (
      c.name.toLowerCase().includes('actual') ||
      c.name.toLowerCase().includes('real')
    )
  )
  
  const budgetCol = schema.columns.find(c => 
    c.type === 'number' && (
      c.name.toLowerCase().includes('budget') ||
      c.name.toLowerCase().includes('plan') ||
      c.name.toLowerCase().includes('target') ||
      c.name.toLowerCase().includes('forecast')
    )
  )
  
  if (!actualCol || !budgetCol) return null
  
  return {
    id: generateId(),
    category: 'recipe',
    scope: 'table',
    title: 'Variance Analysis',
    description: `Compare ${actualCol.name} vs ${budgetCol.name} with variance calculations.`,
    confidence: 'high',
    context: createSuggestionContext(context),
    why: [
      'Detected actual/budget column pattern',
      'Essential for budget tracking',
      'Common in financial analysis',
    ],
    impact: {
      kind: 'recipe',
      summary: 'Creates variance table with abs & % variance',
    },
    action: {
      kind: 'launchRecipe',
      recipeId: 'variance_analysis',
      initialBindings: {
        actualColumnId: actualCol.id,
        budgetColumnId: budgetCol.id,
      },
    },
  }
}

/**
 * Reconciliation Recipe
 * Match/unmatch analysis between two datasets
 */
export function createReconciliationRecipe(
  context: RecipeContext,
  otherTableId: string,
  otherTableName: string
): Suggestion {
  const { tableId, tableName } = context
  
  return {
    id: generateId(),
    category: 'recipe',
    scope: 'table',
    title: 'Reconciliation',
    description: `Match records between ${tableName} and ${otherTableName}. Identify matched, unmatched, and discrepancies.`,
    confidence: 'medium',
    context: createSuggestionContext(context),
    why: [
      'Two tables detected with potential matching keys',
      'Critical for data quality',
      'Required for audit compliance',
    ],
    impact: {
      kind: 'recipe',
      summary: 'Creates match summary + unmatched records table',
    },
    action: {
      kind: 'launchRecipe',
      recipeId: 'reconciliation',
      initialBindings: {
        leftTableId: tableId,
        rightTableId: otherTableId,
      },
    },
  }
}

/**
 * Ratio KPI Recipe
 * Calculate business ratios and KPIs
 */
export function createRatioRecipe(context: RecipeContext): Suggestion | null {
  const { schema, tableId, tableName } = context
  const numericCols = schema.columns.filter(c => c.type === 'number')
  
  if (numericCols.length < 2) return null
  
  // Look for meaningful ratio pairs
  const ratioPatterns = [
    { num: ['gross', 'profit'], denom: ['revenue', 'sales'], name: 'Gross Margin %' },
    { num: ['net', 'profit'], denom: ['revenue', 'sales'], name: 'Net Margin %' },
    { num: ['cost'], denom: ['revenue', 'sales'], name: 'Cost Ratio %' },
    { num: ['count', 'quantity'], denom: ['total'], name: 'Share %' },
  ]
  
  for (const pattern of ratioPatterns) {
    const numCol = numericCols.find(c => 
      pattern.num.some(p => c.name.toLowerCase().includes(p))
    )
    const denomCol = numericCols.find(c => 
      pattern.denom.some(p => c.name.toLowerCase().includes(p))
    )
    
    if (numCol && denomCol && numCol.id !== denomCol.id) {
      // Use column name (what DuckDB expects) for derived tables
      const numColRef = numCol.name || numCol.id
      const denomColRef = denomCol.name || denomCol.id
      return {
        id: generateId(),
        category: 'recipe',
        scope: 'table',
        title: `Calculate ${pattern.name}`,
        description: `Create ${numCol.name} / ${denomCol.name} ratio as a new column.`,
        confidence: 'medium',
        context: createSuggestionContext(context),
        why: [
          'Detected related numeric columns',
          'Business ratios normalize for comparison',
          'Common KPI pattern',
        ],
        impact: {
          kind: 'derivedTable',
          summary: 'Adds calculated percentage column',
        },
        action: {
          kind: 'createDerivedTable',
          transform: {
            type: 'calculated_column',
            sourceTableId: tableId,
            newColumnName: pattern.name.replace(' %', '_pct'),
            expression: `("${numColRef}" / NULLIF("${denomColRef}", 0)) * 100`,
          },
          tableName: `${tableName} (with ${pattern.name})`,
          openAfterApply: true,
        },
      }
    }
  }
  
  // Generic ratio if no pattern matched
  const [col1, col2] = numericCols.slice(0, 2)
  // Use column name (what DuckDB expects) for derived tables
  const col1Ref = col1.name || col1.id
  const col2Ref = col2.name || col2.id
  return {
    id: generateId(),
    category: 'recipe',
    scope: 'table',
    title: `Calculate ${col1.name}/${col2.name} Ratio`,
    description: `Create a ratio of ${col1.name} to ${col2.name}.`,
    confidence: 'low',
    context: createSuggestionContext(context),
    why: [
      'Found multiple numeric columns',
      'Ratios help normalize data',
    ],
    impact: {
      kind: 'derivedTable',
      summary: 'Adds calculated ratio column',
    },
    action: {
      kind: 'createDerivedTable',
      transform: {
        type: 'calculated_column',
        sourceTableId: tableId,
        newColumnName: `${col1.name}_${col2.name}_ratio`,
        expression: `"${col1Ref}" / NULLIF("${col2Ref}", 0)`,
      },
      tableName: `${tableName} (with ratio)`,
      openAfterApply: true,
    },
  }
}

/**
 * Get all applicable recipes for a table
 */
export function getRecipesForTable(context: RecipeContext): Suggestion[] {
  const recipes: Suggestion[] = []
  
  const trend = createTrendRecipe(context)
  if (trend) recipes.push(trend)
  
  const contribution = createContributionRecipe(context)
  if (contribution) recipes.push(contribution)
  
  const variance = createVarianceRecipe(context)
  if (variance) recipes.push(variance)
  
  const ratio = createRatioRecipe(context)
  if (ratio) recipes.push(ratio)
  
  return recipes
}
