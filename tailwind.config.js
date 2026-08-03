export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          secondary: 'rgb(var(--color-surface-secondary-rgb) / <alpha-value>)',
          tertiary: 'var(--color-surface-tertiary)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
          focus: 'var(--color-border-focus)',
          elevation: 'var(--color-border-elevation)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        accent: {
          green: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
          'green-hover': 'var(--color-accent-hover)',
          text: 'var(--color-accent-text)',
          orange: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
          red: 'var(--color-error)',
          purple: 'rgb(var(--color-node-derived-rgb) / <alpha-value>)',
        },
        success: {
          light: 'var(--color-success-soft)',
          DEFAULT: 'rgb(var(--color-success-rgb) / <alpha-value>)',
          dark: 'var(--color-accent-text)',
        },
        warning: {
          light: 'var(--color-warning-soft)',
          DEFAULT: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
          text: 'var(--color-warning-text)',
          dark: 'var(--color-warning-text)',
        },
        error: {
          light: 'var(--color-error-soft)',
          DEFAULT: 'rgb(var(--color-error-rgb) / <alpha-value>)',
          text: 'var(--color-error-text)',
          dark: 'var(--color-error-text)',
        },
        node: {
          source: 'var(--color-node-source)',
          'source-border': 'var(--color-node-source-border)',
          derived: 'var(--color-node-derived)',
          'derived-border': 'var(--color-node-derived-border)',
          'derived-text': 'var(--color-node-derived-text)',
          chart: 'var(--color-node-chart)',
          'chart-border': 'var(--color-node-chart-border)',
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

      // Typography scale: 1.25 ratio (Major Third)
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

      // 4px base grid; spacing-4 (16px) is the Golden Ratio anchor
      spacing: {
        'px': '1px',
        '0': '0px',
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '11': '44px',
        '12': '48px',
        '14': '56px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
      },

      borderRadius: {
        'none': '0px',
        'sm': '4px',
        'DEFAULT': '8px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
        'full': '9999px',
      },

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

      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'fade-out': 'fadeOut 150ms ease-in',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-down': 'slideDown 200ms ease-out',
        'slide-in-right': 'slideInRight 200ms ease-out',
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
        scaleIn: {
          '0%': { opacity: '0', scale: '0.96' },
          '100%': { opacity: '1', scale: '1' },
        },
        scaleOut: {
          '0%': { opacity: '1', scale: '1' },
          '100%': { opacity: '0', scale: '0.96' },
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

      width: {
        'sidebar': '240px',
        'modal-sm': '400px',
        'modal': '520px',
        'modal-lg': '720px',
        'modal-xl': '960px',
      },

      height: {
        'header': '48px',
        'toolbar': '44px',
        'row': '36px',
      },
    },
  },
  plugins: [],
}
