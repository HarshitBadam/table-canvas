/**
 * Core Types - Public API
 * 
 * All type definitions are organized by domain.
 */

// Schema types
export type {
  ColumnType,
  SemanticHint,
  ColumnSchema,
  TableSchema,
  CellValue,
} from './schema.types';

// Node types
export type {
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
} from './node.types';

// Transform types
export type {
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
} from './transform.types';

// Profiling types
export type {
  CardinalityClass,
  ColumnClassification,
  ColumnProfile,
  TableProfile,
} from './profiling.types';

// Suggestion types
export type {
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
} from './suggestion.types';
