/**
 * Core Type Definitions for Table Canvas
 * 
 * This file re-exports types from domain-specific modules for backward compatibility.
 * New code should import directly from '@/core/types' or specific modules.
 */

// Re-export all types from the organized modules
export type {
  // Schema types
  ColumnType,
  SemanticHint,
  ColumnSchema,
  TableSchema,
  CellValue,
  // Node types
  NodeKind,
  Position,
  NodeViewMode,
  NodeUI,
  CacheInfo,
  ViewFilterConfig,
  SourceTablePlan,
  SourceTableNode,
  DerivedTablePlan,
  DerivedTableNode,
  AggregationType,
  ChartConfig,
  ChartPlan,
  ChartNode,
  DashboardCard,
  DashboardLayout,
  DashboardNode,
  TableNode,
  ProjectNode,
  TransformType,
  Edge,
  InsertedRow,
  Patches,
  ProjectState,
  // Transform types
  TransformDef,
  JoinType,
  JoinTransformDef,
  FilterOperator,
  FilterCondition,
  FilterTransformDef,
  SelectColumn,
  SelectTransformDef,
  CalculatedColumnDef,
  Aggregation,
  GroupSummarizeDef,
  UnionTransformDef,
  // Profiling types
  CardinalityClass,
  ColumnClassification,
  ColumnProfile,
  TableProfile,
  // Suggestion types
  SuggestionCategory,
  SuggestionScope,
  SuggestionConfidence,
  PreviewData,
  SuggestionPreview,
  CleaningOperation,
  SuggestionContext,
  SuggestionImpact,
  PatchOp,
  ChartDef,
  SuggestionAction,
  Suggestion,
  LegacySuggestionAction,
} from '@/core/types';
