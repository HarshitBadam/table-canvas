/**
 * Application constants
 * 
 * Centralized configuration for UI dimensions, limits, and behavior settings.
 * All magic numbers should be defined here.
 */

// ============================================================================
// Grid View Constants
// ============================================================================

/** Height of a single row in the data grid (px) */
export const GRID_ROW_HEIGHT = 36

/** Height of the header row in the data grid (px) */
export const GRID_HEADER_HEIGHT = 44

/** Number of rows to render outside the visible viewport for smooth scrolling */
export const GRID_BUFFER_ROWS = 10

/** Default width for columns (px) */
export const GRID_DEFAULT_COLUMN_WIDTH = 150

/** Minimum column width when resizing (px) */
export const GRID_MIN_COLUMN_WIDTH = 60

/** Maximum column width when resizing (px) */
export const GRID_MAX_COLUMN_WIDTH = 500

/** Width of the row number column (px) */
export const GRID_ROW_NUMBER_WIDTH = 50

/** Width of the add column button in header (px) */
export const GRID_ADD_COLUMN_BUTTON_WIDTH = 40

// ============================================================================
// Canvas Constants
// ============================================================================

/** Grid snap size for node positioning (px) */
export const CANVAS_SNAP_GRID = 20

/** Minimum zoom level */
export const CANVAS_MIN_ZOOM = 0.2

/** Maximum zoom level */
export const CANVAS_MAX_ZOOM = 2

/** Padding for fit view (percentage) */
export const CANVAS_FIT_VIEW_PADDING = 0.2

// ============================================================================
// Performance Constants
// ============================================================================

/** Throttle interval for drag updates (ms) - ~60fps */
export const DRAG_THROTTLE_MS = 16

/** Debounce delay for auto-save (ms) */
export const AUTO_SAVE_DEBOUNCE_MS = 1500

/** Debounce delay for suggestion generation (ms) */
export const SUGGESTION_DEBOUNCE_MS = 100

// ============================================================================
// History & Undo Constants
// ============================================================================

/** Maximum number of undo steps to keep */
export const MAX_UNDO_HISTORY = 50

// ============================================================================
// File Import Constants
// ============================================================================

/** Maximum file size for import (bytes) - 50MB */
export const MAX_FILE_SIZE = 50 * 1024 * 1024

/** Supported file extensions */
export const SUPPORTED_FILE_EXTENSIONS = ['.csv', '.xlsx'] as const

// ============================================================================
// Table Profile Constants
// ============================================================================

/** Minimum row count to enable Phase 2 profiling */
export const PROFILE_PHASE2_MIN_ROWS = 100

/** Number of top values to include in column profile */
export const PROFILE_TOP_VALUES_COUNT = 10

// ============================================================================
// Toast & Notification Constants
// ============================================================================

/** Duration for toast notifications (ms) */
export const TOAST_DURATION_MS = 4000

/** Duration for cycle warning toast (ms) */
export const CYCLE_WARNING_DURATION_MS = 4000
