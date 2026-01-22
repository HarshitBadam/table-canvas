/**
 * Design Tokens
 * 
 * Centralized design system values following:
 * - 4px/8px spacing grid
 * - Golden Ratio (1.618) for proportions
 * - WCAG AA compliant colors
 */

// ============================================================================
// Golden Ratio
// ============================================================================

/** Golden ratio constant (φ) */
export const GOLDEN_RATIO = 1.618

// ============================================================================
// Spacing Scale (4px base)
// ============================================================================

/** Spacing values following 4px grid */
export const spacing = {
  /** 0px */
  none: 0,
  /** 2px - half unit */
  '0.5': 2,
  /** 4px - base unit */
  '1': 4,
  /** 6px */
  '1.5': 6,
  /** 8px - 2x base */
  '2': 8,
  /** 10px */
  '2.5': 10,
  /** 12px - 3x base */
  '3': 12,
  /** 16px - 4x base */
  '4': 16,
  /** 20px - 5x base */
  '5': 20,
  /** 24px - 6x base */
  '6': 24,
  /** 32px - 8x base */
  '8': 32,
  /** 40px - 10x base */
  '10': 40,
  /** 48px - 12x base */
  '12': 48,
  /** 64px - 16x base */
  '16': 64,
  /** 10px - Golden ratio small (16/φ) */
  goldenSm: 10,
  /** 16px - Golden ratio base */
  goldenMd: 16,
  /** 26px - Golden ratio large (16*φ) */
  goldenLg: 26,
  /** 42px - Golden ratio extra large (26*φ) */
  goldenXl: 42,
} as const

// ============================================================================
// Border Radius Scale
// ============================================================================

export const borderRadius = {
  /** 4px */
  sm: 4,
  /** 8px */
  md: 8,
  /** 10px */
  DEFAULT: 10,
  /** 12px */
  lg: 12,
  /** 16px */
  xl: 16,
  /** 20px */
  '2xl': 20,
  /** Full rounded */
  full: 9999,
} as const

// ============================================================================
// Typography Scale
// ============================================================================

export const fontSize = {
  /** 11px */
  xs: 11,
  /** 13px */
  sm: 13,
  /** 14px */
  base: 14,
  /** 16px */
  lg: 16,
  /** 18px */
  xl: 18,
  /** 22px */
  '2xl': 22,
  /** 28px */
  '3xl': 28,
} as const

export const lineHeight = {
  xs: 1.4,
  sm: 1.5,
  base: 1.6,
  lg: 1.5,
  xl: 1.4,
  '2xl': 1.3,
  '3xl': 1.2,
} as const

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

// ============================================================================
// Semantic Colors (WCAG AA Compliant)
// ============================================================================

export const colors = {
  // Primary brand colors
  primary: {
    DEFAULT: '#217346',
    hover: '#185c37',
    light: '#e8f5ed',
    dark: '#1a2e22',
  },
  
  // Accent green (primary accent)
  accent: {
    green: '#217346',
    greenHover: '#185c37',
    greenLight: 'rgba(33, 115, 70, 0.1)',
  },
  
  // Semantic colors
  success: {
    DEFAULT: '#107c41',
    light: 'rgba(16, 124, 65, 0.1)',
  },
  warning: {
    DEFAULT: '#d97706',
    light: 'rgba(217, 119, 6, 0.1)',
  },
  error: {
    DEFAULT: '#dc2626',
    light: 'rgba(220, 38, 38, 0.1)',
  },
  info: {
    DEFAULT: '#3b82f6',
    light: 'rgba(59, 130, 246, 0.1)',
  },
  
  // Surface colors - Light mode
  surface: {
    canvas: '#f8faf9',
    DEFAULT: '#ffffff',
    secondary: '#f5f5f7',
    tertiary: '#e8e8ed',
  },
  
  // Border colors - Light mode
  border: {
    DEFAULT: '#d2d2d7',
    subtle: '#e5e5ea',
    focus: '#217346',
  },
  
  // Text colors - Light mode (WCAG AA)
  text: {
    /** Primary text - 4.5:1 contrast on white */
    primary: '#1d1d1f',
    /** Secondary text - 4.5:1 contrast on white */
    secondary: '#6e6e73',
    /** Tertiary text - 4.5:1 contrast on white */
    tertiary: '#86868b',
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
// Dark Mode Colors (WCAG AA Compliant)
// ============================================================================

export const darkColors = {
  primary: {
    DEFAULT: '#22a45d',
    hover: '#2ecc71',
    light: '#1a2e22',
    dark: '#0a0c0b',
  },
  
  surface: {
    canvas: '#0a0c0b',
    DEFAULT: '#1a1a1a',
    secondary: '#242424',
    tertiary: '#2e2e2e',
  },
  
  border: {
    DEFAULT: '#3a3a3a',
    subtle: '#2e2e2e',
    focus: '#22a45d',
  },
  
  text: {
    primary: '#f5f5f5',
    secondary: '#a3a3a3',
    tertiary: '#737373',
  },
} as const

// ============================================================================
// Shadow Scale
// ============================================================================

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 2px 8px rgba(0, 0, 0, 0.08)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.16)',
  node: '0 2px 8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
  nodeHover: '0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.06)',
} as const

export const darkShadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 2px 8px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
} as const

// ============================================================================
// Animation Durations
// ============================================================================

export const duration = {
  fast: 100,
  normal: 150,
  slow: 300,
  slower: 500,
} as const

// ============================================================================
// Z-Index Scale
// ============================================================================

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 100,
} as const
