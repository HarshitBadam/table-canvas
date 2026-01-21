/**
 * Design System Tokens
 * 
 * Centralized design tokens for consistent styling across the application.
 * Based on 4px/8px grid system and Golden Ratio (1.618) proportions.
 * 
 * WCAG AA compliant color combinations are documented.
 */

// ============================================================================
// Spacing System (4px/8px grid)
// ============================================================================

export const SPACING = {
  /** 2px - Micro spacing for tight layouts */
  '0.5': 2,
  /** 4px - Extra small spacing */
  xs: 4,
  /** 6px - Small-medium spacing */
  '1.5': 6,
  /** 8px - Base small spacing */
  sm: 8,
  /** 10px - Small-medium spacing */
  '2.5': 10,
  /** 12px - Medium spacing */
  md: 12,
  /** 16px - Base large spacing */
  lg: 16,
  /** 20px - Large spacing */
  '5': 20,
  /** 24px - Extra large spacing */
  xl: 24,
  /** 32px - 2x large spacing */
  '2xl': 32,
  /** 40px - 3x large spacing */
  '3xl': 40,
  /** 48px - 4x large spacing */
  '4xl': 48,
  /** 64px - 5x large spacing */
  '5xl': 64,
} as const

export type SpacingKey = keyof typeof SPACING
export type SpacingValue = (typeof SPACING)[SpacingKey]

// ============================================================================
// Golden Ratio Sizing
// ============================================================================

export const GOLDEN = {
  /** The golden ratio constant */
  ratio: 1.618,
  
  // Layout widths based on golden ratio progression
  /** 256px - Sidebar width (base) */
  sidebar: 256,
  /** 414px - Panel width (256 * 1.618) */
  panel: 414,
  /** 520px - Standard modal width */
  modal: 520,
  /** 840px - Wide modal width (520 * 1.618) */
  modalWide: 840,
  /** 670px - Medium panel (414 * 1.618) */
  panelWide: 670,
  
  // Row/cell heights
  /** 36px - Standard row height */
  rowHeight: 36,
  /** 44px - Header row height */
  headerHeight: 44,
  /** 48px - Toolbar height */
  toolbarHeight: 48,
  /** 12px - Standard header height (48 * 0.25) */
  headerSmall: 12,
} as const

// ============================================================================
// Color Palette - WCAG AA Compliant
// ============================================================================

export const COLORS = {
  // Primary brand colors - Excel Green Theme
  primary: {
    50: '#e6f4ea',
    100: '#c8e6c9',
    200: '#a5d6a7',
    300: '#81c784',
    400: '#66bb6a',
    500: '#217346',  // Primary brand color
    600: '#185c37',  // Hover state
    700: '#107c41',  // Success variant
    800: '#0d5c2e',
    900: '#0a4522',
  },
  
  // Accent colors for interactive elements
  accent: {
    green: '#217346',
    greenHover: '#185c37',
    blue: '#3b82f6',
    orange: '#ff9500',
    red: '#ff3b30',
    purple: '#a855f7',
    teal: '#14b8a6',
  },
  
  // Semantic colors
  semantic: {
    success: '#107c41',
    warning: '#ff9500',
    error: '#ff3b30',
    info: '#3b82f6',
  },
  
  // Light mode surface colors
  light: {
    canvas: '#f8faf9',
    surface: '#ffffff',
    surfaceSecondary: '#f5f5f7',
    surfaceTertiary: '#e8e8ed',
    border: '#d2d2d7',
    borderSubtle: '#e5e5ea',
    borderFocus: '#217346',
    textPrimary: '#1d1d1f',
    textSecondary: '#6e6e73',
    textTertiary: '#86868b',
  },
  
  // Dark mode surface colors
  dark: {
    canvas: '#0a0c0b',
    surface: '#1a1a1a',
    surfaceSecondary: '#242424',
    surfaceTertiary: '#2e2e2e',
    border: '#3a3a3a',
    borderSubtle: '#2e2e2e',
    borderFocus: '#22a45d',
    textPrimary: '#f5f5f5',
    textSecondary: '#a3a3a3',
    textTertiary: '#737373',
  },
  
  // Node colors for canvas
  node: {
    source: '#e6f4ea',
    sourceBorder: '#217346',
    derived: '#f3e8ff',
    derivedBorder: '#a855f7',
    chart: '#dcfce7',
    chartBorder: '#107c41',
  },
} as const

// ============================================================================
// Typography Scale
// ============================================================================

export const TYPOGRAPHY = {
  fontFamily: {
    sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
  },
  
  fontSize: {
    xs: { size: 11, lineHeight: 1.4 },
    sm: { size: 13, lineHeight: 1.5 },
    base: { size: 14, lineHeight: 1.6 },
    lg: { size: 16, lineHeight: 1.5 },
    xl: { size: 18, lineHeight: 1.4 },
    '2xl': { size: 22, lineHeight: 1.3 },
    '3xl': { size: 28, lineHeight: 1.2 },
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const

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
} as const

// ============================================================================
// Shadows
// ============================================================================

export const SHADOWS = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  DEFAULT: '0 2px 8px rgba(0, 0, 0, 0.08)',
  md: '0 2px 8px rgba(0, 0, 0, 0.08)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.16)',
  node: '0 2px 8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
  nodeHover: '0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.06)',
  
  // Dark mode shadows
  dark: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    DEFAULT: '0 2px 8px rgba(0, 0, 0, 0.4)',
    md: '0 2px 8px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
  },
} as const

// ============================================================================
// Transitions
// ============================================================================

export const TRANSITIONS = {
  /** 100ms - Fast transitions */
  fast: 100,
  /** 150ms - Default transitions */
  DEFAULT: 150,
  /** 200ms - Normal transitions */
  normal: 200,
  /** 300ms - Slow transitions */
  slow: 300,
  
  easing: {
    DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    linear: 'linear',
  },
} as const

// ============================================================================
// Z-Index Scale
// ============================================================================

export const Z_INDEX = {
  /** Below base content */
  negative: -1,
  /** Base content level */
  base: 0,
  /** Raised content (dropdowns, tooltips) */
  dropdown: 10,
  /** Sticky headers */
  sticky: 20,
  /** Fixed elements */
  fixed: 30,
  /** Modals and overlays */
  modal: 40,
  /** Popovers and tooltips */
  popover: 50,
  /** Toast notifications */
  toast: 60,
} as const

// ============================================================================
// Grid Constants
// ============================================================================

export const GRID = {
  /** Virtual scrolling row height */
  rowHeight: 36,
  /** Header row height */
  headerHeight: 44,
  /** Buffer rows for virtual scrolling */
  bufferRows: 10,
  /** Default column width */
  defaultColumnWidth: 150,
  /** Minimum column width */
  minColumnWidth: 60,
  /** Maximum column width */
  maxColumnWidth: 500,
  /** Row number column width */
  rowNumberWidth: 50,
  /** Add column button width */
  addColumnWidth: 40,
} as const

// ============================================================================
// Breakpoints
// ============================================================================

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get spacing value in pixels
 */
export function spacing(key: SpacingKey): number {
  return SPACING[key]
}

/**
 * Get spacing value as CSS string
 */
export function spacingPx(key: SpacingKey): string {
  return `${SPACING[key]}px`
}

/**
 * Get spacing value as rem string
 */
export function spacingRem(key: SpacingKey): string {
  return `${SPACING[key] / 16}rem`
}

/**
 * Calculate golden ratio value
 */
export function goldenRatio(base: number, steps: number = 1): number {
  return Math.round(base * Math.pow(GOLDEN.ratio, steps))
}

/**
 * Check if dark mode is active
 */
export function isDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  return document.documentElement.getAttribute('data-theme') === 'dark' ||
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches &&
      document.documentElement.getAttribute('data-theme') !== 'light')
}

/**
 * Get color based on current theme
 */
export function getThemedColor<K extends keyof typeof COLORS.light>(
  key: K,
  dark?: boolean
): string {
  const isDark = dark ?? isDarkMode()
  return isDark ? COLORS.dark[key] : COLORS.light[key]
}
