import type { ChartType } from '@/types';
import type { EnhancedChartConfig } from '../../types';

export interface ChartNodeAttrs {
  sourceTableId: string;
  chartType: ChartType;
  config: EnhancedChartConfig;
}

export interface ChartNodeOptions {
  reportId?: string;
  onOpenTable?: (tableId: string) => void;
}
