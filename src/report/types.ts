import type { ChartType, ChartConfig } from '@/types';
import type { JSONContent } from '@tiptap/core';


export type BlockType = 'text' | 'heading' | 'chart' | 'table_snippet' | 'table_inline' | 'table_blank' | 'divider';

export type HeadingLevel = 1 | 2 | 3;


export interface ChartAnnotation {
  id: string;
  type: 'line' | 'label';
  value: number;
  label?: string;
  color?: string;
}

export interface EnhancedChartConfig extends ChartConfig {
  title?: string;
  subtitle?: string;
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  colorScheme?: string[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  showGrid?: boolean;
  annotations?: ChartAnnotation[];
}


export interface BaseBlock {
  id: string;
  type: BlockType;
  createdAt: string;
  updatedAt: string;
}


export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
}


export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  level: HeadingLevel;
  content: string;
}


export interface ChartBlock extends BaseBlock {
  type: 'chart';
  sourceTableId: string;
  chartType: ChartType;
  config: EnhancedChartConfig;
}


export type RowSelectionMode = 'all' | 'first_n' | 'last_n' | 'selected';

export type TableDisplayMode = 'full' | 'embedded';

export interface TableSnippetBlock extends BaseBlock {
  type: 'table_snippet';
  sourceTableId: string;
  selectedColumns: string[];
  rowSelectionMode: RowSelectionMode;
  selectedRowIds?: string[];
  rowLimit?: number;
  caption?: string;
  showRowNumbers?: boolean;
  displayMode?: TableDisplayMode;
}


export interface DividerBlock extends BaseBlock {
  type: 'divider';
}


export interface InlineTableBlock extends BaseBlock {
  type: 'table_inline';
  data: {
    headers: string[];
    rows: (string | number | boolean | null | undefined)[][];
  };
  sourceInfo?: {
    tableId: string;
    tableName: string;
  };
  caption?: string;
}


export interface BlankTableBlock extends BaseBlock {
  type: 'table_blank';
  rowCount: number;
  columnCount: number;
  data: {
    headers: string[];
    rows: (string | number | null)[][];
  };
  caption?: string;
}


export type ReportBlock = 
  | TextBlock 
  | HeadingBlock 
  | ChartBlock 
  | TableSnippetBlock 
  | InlineTableBlock
  | BlankTableBlock
  | DividerBlock;


export interface TipTapContent {
  type: 'doc';
  content: TipTapNode[];
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
}

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}


export interface Report {
  id: string;
  name: string;
  /** @deprecated Use tiptapContent instead. Kept for backward compatibility. */
  blocks: ReportBlock[];
  tiptapContent?: JSONContent;
  createdAt: string;
  updatedAt: string;
}


export interface ReportStoreState {
  reports: Record<string, Report>;
  selectedReportId: string | null;
  addReport: (name?: string) => string;
  updateReport: (id: string, updates: Partial<Omit<Report, 'id' | 'createdAt'>>) => void;
  deleteReport: (id: string) => void;
  selectReport: (id: string | null) => void;
  addBlock: (reportId: string, block: Omit<ReportBlock, 'id' | 'createdAt' | 'updatedAt'>, index?: number) => string;
  updateBlock: (reportId: string, blockId: string, updates: Partial<ReportBlock>) => void;
  deleteBlock: (reportId: string, blockId: string) => void;
  reorderBlocks: (reportId: string, fromIndex: number, toIndex: number) => void;
  duplicateBlock: (reportId: string, blockId: string) => string | null;
  transformBlock: (reportId: string, blockId: string, newType: BlockType, newProps?: Record<string, unknown>) => void;
  getReport: (id: string) => Report | undefined;
  getBlock: (reportId: string, blockId: string) => ReportBlock | undefined;
}




