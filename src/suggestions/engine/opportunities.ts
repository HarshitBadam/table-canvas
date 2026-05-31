import type { TableSchema, ColumnSchema, ColumnProfile } from '@/types';
import { isAnalyzableNumeric, isGroupableCategory } from './classification';


export interface AggregationOpportunity {
  valueColumn: ColumnSchema;
  valueProfile?: ColumnProfile;
  groupColumns: Array<{ column: ColumnSchema; profile?: ColumnProfile }>;
}

export function detectAggregationOpportunities(
  schema: TableSchema,
  profiles?: ColumnProfile[]
): AggregationOpportunity[] {
  const opportunities: AggregationOpportunity[] = [];
  
  const numericCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id);
    return isAnalyzableNumeric(c, profile);
  });
  
  const categoryCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id);
    return isGroupableCategory(c, profile);
  });
  
  for (const numCol of numericCols) {
    const numProfile = profiles?.find(p => p.columnId === numCol.id);
    if (categoryCols.length > 0) {
      opportunities.push({
        valueColumn: numCol,
        valueProfile: numProfile,
        groupColumns: categoryCols.map(c => ({
          column: c,
          profile: profiles?.find(p => p.columnId === c.id)
        }))
      });
    }
  }
  
  return opportunities;
}


export interface TimeSeriesOpportunity {
  dateColumn: ColumnSchema;
  valueColumn: ColumnSchema;
  suggestedPeriod: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

export function detectTimeSeriesOpportunities(
  schema: TableSchema,
  profiles?: ColumnProfile[],
  rowCount?: number
): TimeSeriesOpportunity[] {
  const opportunities: TimeSeriesOpportunity[] = [];
  
  const dateCols = schema.columns.filter(c => c.type === 'date' || c.type === 'datetime');
  const numericCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id);
    return isAnalyzableNumeric(c, profile);
  });
  
  for (const dateCol of dateCols) {
    const dateProfile = profiles?.find(p => p.columnId === dateCol.id);
    
    let suggestedPeriod: 'day' | 'week' | 'month' | 'quarter' | 'year' = 'month';
    if (dateProfile?.min && dateProfile?.max && rowCount) {
      const spanDays = (dateProfile.max - dateProfile.min) / (1000 * 60 * 60 * 24);
      const avgGap = spanDays / Math.max(rowCount - 1, 1);
      
      if (avgGap < 2) suggestedPeriod = 'day';
      else if (avgGap < 10) suggestedPeriod = 'week';
      else if (avgGap < 45) suggestedPeriod = 'month';
      else if (avgGap < 120) suggestedPeriod = 'quarter';
      else suggestedPeriod = 'year';
    }
    
    for (const numCol of numericCols) {
      opportunities.push({ dateColumn: dateCol, valueColumn: numCol, suggestedPeriod });
    }
  }
  
  return opportunities;
}


export interface ComparisonOpportunity {
  column1: ColumnSchema;
  column2: ColumnSchema;
  similarity: number;
}

export function detectComparisonOpportunities(
  schema: TableSchema,
  profiles?: ColumnProfile[]
): ComparisonOpportunity[] {
  const opportunities: ComparisonOpportunity[] = [];
  
  const numericCols = schema.columns.filter(c => {
    const profile = profiles?.find(p => p.columnId === c.id);
    return isAnalyzableNumeric(c, profile);
  });
  
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const col1 = numericCols[i];
      const col2 = numericCols[j];
      const profile1 = profiles?.find(p => p.columnId === col1.id);
      const profile2 = profiles?.find(p => p.columnId === col2.id);
      
      let similarity = 0.5;
      if (profile1?.min !== undefined && profile1?.max !== undefined &&
          profile2?.min !== undefined && profile2?.max !== undefined) {
        const range1 = Math.abs(profile1.max - profile1.min) || 1;
        const range2 = Math.abs(profile2.max - profile2.min) || 1;
        const rangeRatio = Math.min(range1, range2) / Math.max(range1, range2);
        
        const mean1 = profile1.mean ?? (profile1.min + profile1.max) / 2;
        const mean2 = profile2.mean ?? (profile2.min + profile2.max) / 2;
        const meanRatio = Math.min(Math.abs(mean1), Math.abs(mean2)) / 
                         Math.max(Math.abs(mean1), Math.abs(mean2), 1);
        
        similarity = (rangeRatio + meanRatio) / 2;
      }
      
      opportunities.push({ column1: col1, column2: col2, similarity });
    }
  }
  
  return opportunities.sort((a, b) => b.similarity - a.similarity);
}
