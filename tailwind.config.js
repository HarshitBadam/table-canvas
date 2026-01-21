/** @type {import('tailwindcss').Config} */

/**
 * Tailwind CSS Configuration
 * 
 * Design System Integration:
 * - 4px base grid spacing system
 * - WCAG AA compliant colors
 * - Modular typography scale (1.25 ratio)
 * - Consistent border radius scale
 */

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // CSS variable-based colors for runtime theming
        canvas: 'var(--color-canvas)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          secondary: 'var(--color-surface-secondary)',
          tertiary: 'var(--color-surface-tertiary)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
          focus: 'var(--color-border-focus)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        
        // Primary palette - Excel Green Theme (WCAG AA: 4.5:1)
        primary: {
          50: '#e6f4ea',
          100: '#c2e5cd',
          200: '#9bd6af',
          300: '#72c690',
          400: '#52ba79',
          500: '#217346',
          600: '#185c37',
          700: '#124a2c',
          800: '#0c3820',
          900: '#062614',
        },
        
        // Accent colors - Semantic palette
        accent: {
          green: 'var(--color-accent)',
          'green-hover': 'var(--color-accent-hover)',
          blue: '#3b82f6',
          orange: 'var(--color-warning)',
          red: 'var(--color-error)',
          purple: '#a855f7',
          teal: '#14b8a6',
        },
        
        // Semantic colors
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
        
        // Node colors for canvas
        node: {
          source: '#e6f4ea',
          'source-border': '#217346',
          derived: '#f3e8ff',
          'derived-border': '#a855f7',
          chart: '#dcfce7',
          'chart-border': '#107c41',
        },
        
        // Chart colors - Accessible palette
        chart: {
          blue: '#3b82f6',
          green: '#22c55e',
          orange: '#f59e0b',
          purple: '#a855f7',
          teal: '#14b8a6',
          pink: '#ec4899',
        },
      },
      
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'SF Mono',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      
      // Typography scale (1.25 ratio - Major Third)
      fontSize: {
        'xs': ['11px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'sm': ['13px', { lineHeight: '1.5' }],
        'base': ['14px', { lineHeight: '1.6' }],
        'lg': ['16px', { lineHeight: '1.5' }],
        'xl': ['18px', { lineHeight: '1.4' }],
        '2xl': ['22px', { lineHeight: '1.3' }],
        '3xl': ['28px', { lineHeight: '1.2' }],
        'display': ['36px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
      
      // 4px base grid spacing system
      spacing: {
        'px': '1px',
        '0': '0px',
        '0.5': '2px',    // 0.5x base
        '1': '4px',      // 1x base (xs)
        '1.5': '6px',    // 1.5x base
        '2': '8px',      // 2x base (sm)
        '2.5': '10px',   // 2.5x base
        '3': '12px',     // 3x base (md)
        '4': '16px',     // 4x base (lg) - Golden Ratio anchor
        '5': '20px',     // 5x base (xl)
        '6': '24px',     // 6x base (2xl)
        '7': '28px',     // 7x base
        '8': '32px',     // 8x base (3xl)
        '9': '36px',     // 9x base
        '10': '40px',    // 10x base (4xl)
        '11': '44px',    // 11x base (header height)
        '12': '48px',    // 12x base (5xl)
        '14': '56px',    // 14x base
        '16': '64px',    // 16x base (6xl)
        '20': '80px',    // 20x base
        '24': '96px',    // 24x base
      },
      
      // Border radius scale
      borderRadius: {
        'none': '0px',
        'sm': '4px',
        'DEFAULT': '8px',
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
        'full': '9999px',
      },
      
      // Box shadows
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'DEFAULT': 'var(--shadow-md)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': '0 16px 48px rgba(0, 0, 0, 0.16)',
        '2xl': '0 24px 64px rgba(0, 0, 0, 0.2)',
        'node': '0 2px 8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        'node-hover': '0 4px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.06)',
        'inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
        'none': 'none',
      },
      
      // Animation system
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'fade-out': 'fadeOut 150ms ease-in',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-down': 'slideDown 200ms ease-out',
        'slide-in-right': 'slideInRight 200ms ease-out',
        'slide-in-left': 'slideInLeft 200ms ease-out',
        'scale-in': 'scaleIn 200ms ease-out',
        'scale-out': 'scaleOut 150ms ease-in',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'spin': 'spin 1s linear infinite',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        scaleOut: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.95)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      
      // Transition system
      transitionDuration: {
        'fast': '100ms',
        'DEFAULT': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      },
      
      transitionTimingFunction: {
        'DEFAULT': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'in': 'cubic-bezier(0.4, 0, 1, 1)',
        'out': 'cubic-bezier(0, 0, 0.2, 1)',
        'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      
      // Z-index scale
      zIndex: {
        'behind': -1,
        'base': 0,
        'dropdown': 10,
        'sticky': 20,
        'fixed': 30,
        'modal-backdrop': 40,
        'modal': 50,
        'popover': 60,
        'tooltip': 70,
        'toast': 80,
      },
      
      // Widths for common UI elements
      width: {
        'sidebar': '240px',
        'modal-sm': '400px',
        'modal': '520px',
        'modal-lg': '720px',
        'modal-xl': '960px',
      },
      
      // Heights for common UI elements
      height: {
        'header': '48px',
        'toolbar': '44px',
        'row': '36px',
      },
    },
  },
  plugins: [],
}
