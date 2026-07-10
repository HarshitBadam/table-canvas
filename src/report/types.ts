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

export interface ChartAnnotation {
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
