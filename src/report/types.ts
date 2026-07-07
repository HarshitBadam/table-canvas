/**
 * Report Type Definitions
 * 
 * Types for the Notion-like report editor with block-based content.
 */

import type { AggregationType } from '@/core/types/node.types';

// ============================================================================
// Block Types
// ============================================================================

export type BlockType = 'text' | 'heading' | 'chart' | 'table_snippet' | 'table_inline' | 'table_blank' | 'divider';

export type HeadingLevel = 1 | 2 | 3;

// ============================================================================
// Enhanced Chart Configuration
// ============================================================================

export interface ChartAnnotation {
  id: string;
  type: 'line' | 'label';
  value: number;
  label?: string;
  color?: string;
}

export interface EnhancedChartConfig {
  // Data mapping (from existing ChartConfig)
  xAxis?: string;
  yAxis?: string;
  series?: string[];
  aggregation?: AggregationType;
  groupBy?: string;
  
  // Enhanced display options
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

// ============================================================================
// Base Block Interface
// ============================================================================

export interface BaseBlock {
  id: string;
  type: BlockType;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Text Block
// ============================================================================

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string; // Markdown content
}

// ============================================================================
// Heading Block
// ============================================================================

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  level: HeadingLevel;
  content: string;
}

// ============================================================================
// Chart Block
// ============================================================================

export interface ChartBlock extends BaseBlock {
  type: 'chart';
  sourceTableId: string;
  chartType: 'bar' | 'line' | 'pie' | 'scatter';
  config: EnhancedChartConfig;
}

// ============================================================================
// Table Snippet Block
// ============================================================================

export type RowSelectionMode = 'all' | 'first_n' | 'last_n' | 'selected';

export type TableDisplayMode = 'full' | 'embedded';

export interface TableSnippetBlock extends BaseBlock {
  type: 'table_snippet';
  sourceTableId: string;
  selectedColumns: string[]; // Column IDs to include
  rowSelectionMode: RowSelectionMode;
  selectedRowIds?: string[]; // For 'selected' mode
  rowLimit?: number; // For 'first_n' and 'last_n' modes
  caption?: string;
  showRowNumbers?: boolean;
  displayMode?: TableDisplayMode; // 'full' (default) or 'embedded' (MiniTableView style)
}

// ============================================================================
// Divider Block
// ============================================================================

export interface DividerBlock extends BaseBlock {
  type: 'divider';
}

// ============================================================================
// Inline Table Block (for pasted data from grid)
// ============================================================================

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

// ============================================================================
// Blank Table Block (user-defined empty table)
// ============================================================================

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

// ============================================================================
// Union Block Type
// ============================================================================

export type ReportBlock = 
  | TextBlock 
  | HeadingBlock 
  | ChartBlock 
  | TableSnippetBlock 
  | InlineTableBlock
  | BlankTableBlock
  | DividerBlock;

// ============================================================================
// TipTap Content Type
// ============================================================================

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

// ============================================================================
// Report Interface
// ============================================================================

export interface Report {
  id: string;
  name: string;
  /** @deprecated Use tiptapContent instead. Kept for backward compatibility. */
  blocks: ReportBlock[];
  /** TipTap JSON content - new format */
  tiptapContent?: TipTapContent;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Report Store State Types
// ============================================================================

export interface ReportStoreState {
  reports: Record<string, Report>;
  selectedReportId: string | null;

  // Report actions
  addReport: (name?: string) => string;
  updateReport: (id: string, updates: Partial<Omit<Report, 'id' | 'createdAt'>>) => void;
  deleteReport: (id: string) => void;
  selectReport: (id: string | null) => void;

  // Selectors
  getReport: (id: string) => Report | undefined;
}

// ============================================================================
// Color Schemes
// ============================================================================

export const CHART_COLOR_SCHEMES = {
  default: ['#217346', '#2D8B57', '#0EA5E9', '#8B5CF6', '#F59E0B', '#EF4444'],
  ocean: ['#0EA5E9', '#06B6D4', '#14B8A6', '#10B981', '#22C55E', '#84CC16'],
  sunset: ['#F59E0B', '#F97316', '#EF4444', '#EC4899', '#D946EF', '#A855F7'],
  earth: ['#78716C', '#A8A29E', '#92400E', '#B45309', '#CA8A04', '#65A30D'],
  monochrome: ['#18181B', '#3F3F46', '#52525B', '#71717A', '#A1A1AA', '#D4D4D8'],
} as const;

export type ColorSchemeName = keyof typeof CHART_COLOR_SCHEMES;
