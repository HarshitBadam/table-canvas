import type { 
  Suggestion, 
  SuggestionCategory,
  SuggestionScope,
  TableSchema, 
  ColumnSchema,
  ColumnProfile,
} from '@/types';


export interface SuggestionEngineContext {
  tableId: string;
  tableName: string;
  schema: TableSchema;
  profile?: {
    columns: ColumnProfile[];
    rowCount: number;
  };
  selectedColumnId?: string;
  tableVersionHash?: string;
  // Existing derived tables from this source - used to avoid suggesting already-created transforms
  existingDerivedTables?: Array<{
    id: string;
    name: string;
    transformType: string;
    groupByColumns?: string[];
  }>;
}

export interface MetadataBundle {
  schema: TableSchema;
  profile?: {
    columns: ColumnProfile[];
    rowCount: number;
  };
  column?: ColumnSchema;
  columnProfile?: ColumnProfile;
}

export interface SuggestionRule {
  id: string;
  category: SuggestionCategory;
  scope: SuggestionScope;
  when: (ctx: SuggestionEngineContext, meta: MetadataBundle) => boolean;
  build: (ctx: SuggestionEngineContext, meta: MetadataBundle) => Suggestion;
  score: (ctx: SuggestionEngineContext, meta: MetadataBundle) => number;
}


const suggestionRules: SuggestionRule[] = [];

export function registerRule(rule: SuggestionRule): void {
  suggestionRules.push(rule);
}

export function getTableRules(): SuggestionRule[] {
  return suggestionRules.filter(r => r.scope === 'table');
}

export function getColumnRules(): SuggestionRule[] {
  return suggestionRules.filter(r => r.scope === 'column');
}


import { generateTableVersionHash } from '../suggestionsStore';

/** Deterministic ID ensures the same suggestion keeps the same ID across regenerations. */
export function createSuggestionId(ruleId: string, tableId: string, columnId?: string, extra?: string): string {
  const parts = [ruleId, tableId];
  if (columnId) parts.push(columnId);
  if (extra) parts.push(extra);
  return parts.join(':');
}

export function getVersionHash(ctx: SuggestionEngineContext): string {
  return ctx.tableVersionHash ?? generateTableVersionHash(
    ctx.tableId,
    ctx.profile?.rowCount ?? 0,
    ctx.schema.columns.length,
    undefined
  );
}
