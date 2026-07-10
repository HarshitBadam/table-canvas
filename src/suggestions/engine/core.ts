import type { Suggestion, TransformDef } from '@/types';
import { 
  SuggestionEngineContext, 
  MetadataBundle,
  getTableRules,
  getColumnRules,
} from './registry';

// Import rules to ensure they're registered
import './rules';


interface ScoredSuggestion {
  suggestion: Suggestion;
  score: number;
}


export function generateSuggestions(context: SuggestionEngineContext): Suggestion[] {
  const scored: ScoredSuggestion[] = [];
  
  const meta: MetadataBundle = {
    schema: context.schema,
    profile: context.profile,
  };
  
  const tableRules = getTableRules();
  
  for (const rule of tableRules) {
    try {
      const matches = rule.when(context, meta);
      if (matches) {
        const suggestion = rule.build(context, meta);
        const score = rule.score(context, meta);
        scored.push({ suggestion, score });
      }
    } catch (error) {
      console.error('[SuggestionEngine] Table rule evaluation failed:', error);
    }
  }
  
  const columnRules = getColumnRules();
  
  for (const column of context.schema.columns) {
    const columnMeta: MetadataBundle = {
      ...meta,
      column,
      columnProfile: context.profile?.columns.find(p => p.columnId === column.id),
    };
    
    for (const rule of columnRules) {
      try {
        if (rule.when(context, columnMeta)) {
          const suggestion = rule.build(context, columnMeta);
          const score = rule.score(context, columnMeta);
          scored.push({ suggestion, score });
        }
      } catch (error) {
        console.error('[SuggestionEngine] Column rule evaluation failed:', error);
      }
    }
  }
  
  scored.sort((a, b) => b.score - a.score);
  
  // Apply limits: 10 cleaning, 3 analysis, 2 recipes, max 15 total
  const result: Suggestion[] = [];
  const counts = { cleaning: 0, analysis: 0, recipe: 0 };
  const limits = { cleaning: 10, analysis: 3, recipe: 2 };
  
  for (const { suggestion } of scored) {
    if (result.length >= 15) break;
    
    const cat = suggestion.category;
    if (counts[cat] < limits[cat]) {
      result.push(suggestion);
      counts[cat]++;
    }
  }
  
  return result;
}

export function getColumnSuggestions(context: SuggestionEngineContext): Suggestion[] {
  if (!context.selectedColumnId) return [];
  
  const column = context.schema.columns.find(c => c.id === context.selectedColumnId);
  if (!column) return [];
  
  const scored: ScoredSuggestion[] = [];
  
  const meta: MetadataBundle = {
    schema: context.schema,
    profile: context.profile,
    column,
    columnProfile: context.profile?.columns.find(p => p.columnId === column.id),
  };
  
  for (const rule of getColumnRules()) {
    try {
      if (rule.when(context, meta)) {
        const suggestion = rule.build(context, meta);
        const score = rule.score(context, meta);
        scored.push({ suggestion, score });
      }
    } catch (error) {
      console.error('[SuggestionEngine] Column-scoped rule evaluation failed:', error);
    }
  }
  
  // Also include table-scoped rules that involve this column
  const tableMeta: MetadataBundle = {
    schema: context.schema,
    profile: context.profile,
  };
  
  for (const rule of getTableRules()) {
    try {
      if (rule.when(context, tableMeta)) {
        const suggestion = rule.build(context, tableMeta);

        const action = suggestion.action;
        let involvesColumn = false;

        if (action.kind === 'createChart') {
          const config = action.chart.config;
          involvesColumn = config.xAxis === context.selectedColumnId ||
                           config.yAxis === context.selectedColumnId ||
                           config.groupBy === context.selectedColumnId;
        } else if (action.kind === 'createDerivedTable') {
          const transform = action.transform as TransformDef;
          if (transform.type === 'group_summarize') {
            involvesColumn = transform.groupByColumns.includes(context.selectedColumnId!) ||
                             transform.aggregations.some(a => a.columnId === context.selectedColumnId);
          } else if (transform.type === 'calculated_column') {
            involvesColumn = transform.expression.includes(context.selectedColumnId!);
          }
        }

        if (involvesColumn) {
          const score = rule.score(context, tableMeta);
          scored.push({ suggestion, score });
        }
      }
    } catch (error) {
      console.error('[SuggestionEngine] Table-scoped rule evaluation failed:', error);
    }
  }
  
  scored.sort((a, b) => b.score - a.score);
  
  const result: Suggestion[] = [];
  const counts = { cleaning: 0, analysis: 0, recipe: 0 };
  const limits = { cleaning: 10, analysis: 3, recipe: 2 };
  
  for (const { suggestion } of scored) {
    if (result.length >= 15) break;
    
    const cat = suggestion.category;
    if (counts[cat] < limits[cat]) {
      result.push(suggestion);
      counts[cat]++;
    }
  }
  
  return result;
}
