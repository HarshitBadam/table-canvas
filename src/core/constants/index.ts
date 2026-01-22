/**
 * Application-wide Constants
 */

// Re-export grid constants from design tokens
export { GRID, CANVAS } from '@/design/tokens';

// Application-specific constants
export const APP_NAME = 'Table Canvas';
export const APP_VERSION = '1.0.0';

// API endpoints
export const API_BASE_URL = '/api';

// Storage keys
export const STORAGE_KEYS = {
  THEME: 'table-canvas-theme',
  AUTH_TOKEN: 'auth-token',
  LAST_PROJECT: 'last-project-id',
} as const;

// Default values
export const DEFAULTS = {
  PROJECT_NAME: 'Untitled Project',
  TABLE_NAME: 'New Table',
  CHART_NAME: 'New Chart',
} as const;

// Limits
export const LIMITS = {
  MAX_UNDO_HISTORY: 50,
  MAX_FILE_SIZE_MB: 100,
  DEBOUNCE_SAVE_MS: 1500,
  THROTTLE_DRAG_MS: 16,
} as const;
