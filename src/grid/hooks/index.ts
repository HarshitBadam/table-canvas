/**
 * Grid Hooks
 * 
 * Custom hooks for grid functionality.
 */

export { useVirtualScroll } from './useVirtualScroll';
export type { VirtualScrollConfig, VirtualScrollState } from './useVirtualScroll';

export { useColumnResize } from './useColumnResize';
export type { ColumnResizeConfig, ColumnResizeState } from './useColumnResize';

export { useGridEditing, validateValue } from './useGridEditing';
export type { EditingCell, ValidationResult, GridEditingConfig, GridEditingState } from './useGridEditing';

export { useGridSelection } from './useGridSelection';
export type {
  SelectionType,
  CellRangeSelection,
  GridSelectionConfig,
  GridSelectionState,
} from './useGridSelection';

export { useAutofill } from './useAutofill';
export type { AutofillPreviewItem, AutofillConfig, AutofillState } from './useAutofill';
