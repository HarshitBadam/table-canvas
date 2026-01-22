/**
 * Type definitions barrel export
 * 
 * Domain-organized type system for Table Canvas
 */

// Common types
export type {
  CellValue,
  Position,
  Patches,
  InsertedRow,
  PatchOp,
  ProjectState,
} from './common.types'

// Schema types
export type {
  ColumnType,
  SemanticHint,
  ColumnSchema,
  TableSchema,
} from './schema.types'

// Node types
export type {
  NodeKind,
  NodeViewMode,
  NodeUI,
  CacheInfo,
  SourceTablePlan,
  SourceTableNode,
  DerivedTablePlan,
  DerivedTableNode,
  ChartConfig,
  ChartPlan,
  ChartNode,
  DashboardCard,
  DashboardLayout,
  DashboardNode,
  TableNode,
  ProjectNode,
} from './node.types'

// Transform types
export type {
  TransformType,
  Edge,
  TransformDef,
  JoinType,
  JoinTransformDef,
  FilterOperator,
  FilterCondition,
  FilterTransformDef,
  SelectColumn,
  SelectTransformDef,
  CalculatedColumnDef,
  AggregationType,
  Aggregation,
  GroupSummarizeDef,
  UnionTransformDef,
  ViewFilterConfig,
} from './transform.types'

// Profile types
export type {
  CardinalityClass,
  ColumnClassification,
  ColumnProfile,
  TableProfile,
} from './profile.types'

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
  ChartDef,
  SuggestionAction,
  Suggestion,
  LegacySuggestionAction,
} from './suggestion.types'
