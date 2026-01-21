/**
 * Design Tokens - Centralized design system constants
 * 
 * All spacing follows a 4px base grid system.
 * Colors are WCAG AA compliant (4.5:1 contrast ratio minimum).
 * Typography follows a modular scale with 1.25 ratio.
 */

// ============================================================================
// Spacing System (4px base grid)
// ============================================================================

export const SPACING = {
  /** 4px - Extra small, for tight padding */
  xs: 4,
  /** 8px - Small spacing */
  sm: 8,
  /** 12px - Medium spacing */
  md: 12,
  /** 16px - Large spacing (Golden Ratio base) */
  lg: 16,
  /** 20px - Extra large */
  xl: 20,
  /** 24px - 2x large */
  '2xl': 24,
  /** 32px - 3x large */
  '3xl': 32,
  /** 40px - 4x large */
  '4xl': 40,
  /** 48px - 5x large */
  '5xl': 48,
  /** 64px - 6x large */
  '6xl': 64,
} as const;

export type SpacingKey = keyof typeof SPACING;
export type SpacingValue = (typeof SPACING)[SpacingKey];

// ============================================================================
// Color Palette (WCAG AA Compliant)
// ============================================================================

export const COLORS = {
  // Primary - Excel Green Theme
  primary: {
    50: '#e6f4ea',
    100: '#c2e5cd',
    200: '#9bd6af',
    300: '#72c690',
    400: '#52ba79',
    500: '#217346', // Main brand color - 4.5:1 on white
    600: '#185c37', // Hover state
    700: '#124a2c',
    800: '#0c3820',
    900: '#062614',
  },
  
  // Secondary - Accent colors
  secondary: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  
  // Neutral - Grays for surfaces and text
  neutral: {
    0: '#ffffff',
    50: '#fafafa',
    100: '#f5f5f7',
    200: '#e8e8ed',
    300: '#d2d2d7',
    400: '#a3a3a8',
    500: '#6e6e73',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
    950: '#0a0a0b',
  },
  
  // Semantic Colors
  success: {
    light: '#dcfce7',
    DEFAULT: '#22c55e',
    dark: '#166534',
  },
  
  warning: {
    light: '#fef3c7',
    DEFAULT: '#f59e0b',
    dark: '#92400e',
  },
  
  error: {
    light: '#fee2e2',
    DEFAULT: '#ef4444',
    dark: '#991b1b',
  },
  
  info: {
    light: '#dbeafe',
    DEFAULT: '#3b82f6',
    dark: '#1e40af',
  },
  
  // Chart colors - Accessible palette
  chart: {
    blue: '#3b82f6',
    green: '#22c55e',
    orange: '#f59e0b',
    purple: '#a855f7',
    teal: '#14b8a6',
    pink: '#ec4899',
    indigo: '#6366f1',
    amber: '#f59e0b',
  },
} as const;

// ============================================================================
// Typography Scale (1.25 ratio - Major Third)
// ============================================================================

export const TYPOGRAPHY = {
  fontFamily: {
    sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
  },
  
  fontSize: {
    /** 11px - Extra small text */
    xs: { size: 11, lineHeight: 1.4 },
    /** 13px - Small text */
    sm: { size: 13, lineHeight: 1.5 },
    /** 14px - Base text */
    base: { size: 14, lineHeight: 1.6 },
    /** 16px - Large text */
    lg: { size: 16, lineHeight: 1.5 },
    /** 18px - Extra large text */
    xl: { size: 18, lineHeight: 1.4 },
    /** 22px - 2x large text */
    '2xl': { size: 22, lineHeight: 1.3 },
    /** 28px - 3x large text */
    '3xl': { size: 28, lineHeight: 1.2 },
    /** 36px - Display text */
    display: { size: 36, lineHeight: 1.1 },
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

// ============================================================================
// Border Radius
// ============================================================================

export const RADIUS = {
  /** 4px - Small radius */
  sm: 4,
  /** 8px - Default radius */
  DEFAULT: 8,
  /** 10px - Medium radius */
  md: 10,
  /** 12px - Large radius */
  lg: 12,
  /** 16px - Extra large radius */
  xl: 16,
  /** 20px - 2x large radius */
  '2xl': 20,
  /** Full circle */
  full: 9999,
} as const;

// ============================================================================
// Shadows
// ============================================================================

export const SHADOWS = {
  /** Subtle shadow for cards */
  sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  /** Default shadow */
  DEFAULT: '0 2px 8px rgba(0, 0, 0, 0.08)',
  /** Medium shadow for dropdowns */
  md: '0 4px 12px rgba(0, 0, 0, 0.1)',
  /** Large shadow for modals */
  lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
  /** Extra large shadow for floating elements */
  xl: '0 16px 48px rgba(0, 0, 0, 0.16)',
  /** Node shadow for canvas nodes */
  node: '0 2px 8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
  /** Node hover shadow */
  nodeHover: '0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.06)',
} as const;

// Dark mode shadows
export const SHADOWS_DARK = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  DEFAULT: '0 2px 8px rgba(0, 0, 0, 0.4)',
  md: '0 4px 12px rgba(0, 0, 0, 0.45)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.55)',
  node: '0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.06)',
  nodeHover: '0 4px 16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1)',
} as const;

// ============================================================================
// Transitions
// ============================================================================

export const TRANSITIONS = {
  /** 100ms - Fast interactions */
  fast: '100ms',
  /** 150ms - Default transitions */
  DEFAULT: '150ms',
  /** 200ms - Normal transitions */
  normal: '200ms',
  /** 300ms - Slow transitions */
  slow: '300ms',
  /** Standard easing curve */
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Ease out for enter animations */
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Ease in for exit animations */
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

// ============================================================================
// Z-Index Scale
// ============================================================================

export const Z_INDEX = {
  /** Behind everything */
  behind: -1,
  /** Default stacking */
  base: 0,
  /** Dropdown menus */
  dropdown: 10,
  /** Sticky headers */
  sticky: 20,
  /** Fixed elements */
  fixed: 30,
  /** Modal backdrop */
  modalBackdrop: 40,
  /** Modal content */
  modal: 50,
  /** Popovers */
  popover: 60,
  /** Tooltips */
  tooltip: 70,
  /** Toast notifications */
  toast: 80,
} as const;

// ============================================================================
// Breakpoints
// ============================================================================

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// ============================================================================
// Grid Constants
// ============================================================================

export const GRID = {
  /** Row height for data grids */
  rowHeight: 36,
  /** Header height for data grids */
  headerHeight: 44,
  /** Default column width */
  columnWidth: 150,
  /** Minimum column width */
  minColumnWidth: 60,
  /** Maximum column width */
  maxColumnWidth: 500,
  /** Buffer rows for virtual scrolling */
  bufferRows: 10,
} as const;

// ============================================================================
// Canvas Constants
// ============================================================================

export const CANVAS = {
  /** Snap grid size */
  snapGrid: 20,
  /** Minimum zoom level */
  minZoom: 0.2,
  /** Maximum zoom level */
  maxZoom: 2,
  /** Default node width */
  nodeWidth: 280,
  /** Node spacing for auto-layout */
  nodeSpacingX: 300,
  nodeSpacingY: 150,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get spacing value in pixels
 */
export function spacing(key: SpacingKey): number {
  return SPACING[key];
}

/**
 * Get spacing value as CSS string
 */
export function spacingPx(key: SpacingKey): string {
  return `${SPACING[key]}px`;
}

/**
 * Create a CSS custom property reference
 */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

/**
 * Get contrasting text color for a background
 */
export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? COLORS.neutral[900] : COLORS.neutral[0];
}
