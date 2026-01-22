/**
 * Spinner Component
 * 
 * Loading spinner indicator.
 */

import { memo } from 'react'

// ============================================================================
// Types
// ============================================================================

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl'

export interface SpinnerProps {
  /** Spinner size */
  size?: SpinnerSize
  /** Custom color class */
  colorClass?: string
  /** Label for accessibility */
  label?: string
  /** Additional class names */
  className?: string
}

// ============================================================================
// Styles
// ============================================================================

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
}

// ============================================================================
// Component
// ============================================================================

export const Spinner = memo(function Spinner({
  size = 'md',
  colorClass = 'text-accent-green',
  label = 'Loading...',
  className = '',
}: SpinnerProps) {
  const classes = [
    'animate-spin',
    sizeStyles[size],
    colorClass,
    className,
  ].filter(Boolean).join(' ')

  return (
    <svg
      className={classes}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
})

/**
 * Full-page loading spinner with optional message
 */
export const LoadingOverlay = memo(function LoadingOverlay({
  message = 'Loading...',
}: {
  message?: string
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-canvas/80 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" />
        <p className="text-sm text-text-secondary">{message}</p>
      </div>
    </div>
  )
})

export default Spinner
