/**
 * Report Type Definitions
 *
 * Types for the TipTap-based report editor. Report content is stored as
 * TipTap JSON (`tiptapContent`); there is no legacy block format.
 */

import type { AggregationType } from '@/types';

// ============================================================================
// Chart Configuration
// ============================================================================

interface ChartAnnotation {
  id: string;
  type: 'line' | 'label';
  value: number;
  label?: string;
  color?: string;
}

export interface EnhancedChartConfig {
  // Data mapping
  xAxis?: string;
  yAxis?: string;
  series?: string[];
  aggregation?: AggregationType;
  groupBy?: string;

  // Display options
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
// TipTap Content
// ============================================================================

interface TipTapContent {
  type: 'doc';
  content: TipTapNode[];
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
}

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// ============================================================================
// Report
// ============================================================================

export interface Report {
  id: string;
  name: string;
  /** TipTap JSON content. */
  tiptapContent?: TipTapContent;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Report Store State
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
