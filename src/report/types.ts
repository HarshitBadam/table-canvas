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

export interface TipTapContent {
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
  /** Owning project. Missing only on legacy records created before project scoping. */
  projectId?: string;
  schemaVersion?: number;
  name: string;
  /** TipTap JSON content. */
  tiptapContent?: TipTapContent;
  createdAt: string;
  updatedAt: string;
}

export type ReportTemplateId = 'blank' | 'executive-summary' | 'data-review';
type ReportPersistenceStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

// ============================================================================
// Report Store State
// ============================================================================

export interface ReportStoreState {
  reports: Record<string, Report>;
  selectedReportId: string | null;
  activeProjectId: string | null;
  persistenceStatus: ReportPersistenceStatus;
  persistenceError: string | null;

  // Report actions
  initializeProject: (projectId: string) => Promise<void>;
  reset: () => void;
  addReport: (name?: string, template?: ReportTemplateId) => string;
  duplicateReport: (id: string) => string | null;
  updateReport: (id: string, updates: Partial<Omit<Report, 'id' | 'createdAt'>>) => void;
  deleteReport: (id: string) => void;
  selectReport: (id: string | null) => void;
  flushSaves: () => Promise<void>;

  // Selectors
  getReport: (id: string) => Report | undefined;
}
