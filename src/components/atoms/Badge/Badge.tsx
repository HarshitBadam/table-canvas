/**
 * Badge Component
 * 
 * A label/badge component for status indicators and tags.
 */

import React, { memo } from 'react'

// ============================================================================
// Types
// ============================================================================

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'
export type BadgeSize = 'sm' | 'md' | 'lg'

export interface BadgeProps {
  /** Badge content */
  children: React.ReactNode
  /** Badge variant */
  variant?: BadgeVariant
  /** Badge size */
  size?: BadgeSize
  /** Dot indicator */
  dot?: boolean
  /** Removable badge */
  removable?: boolean
  /** Remove callback */
  onRemove?: () => void
  /** Additional class names */
  className?: string
}

// ============================================================================
// Styles
// ============================================================================

const baseStyles = 'inline-flex items-center gap-1 font-medium rounded-full'

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-secondary text-text-secondary',
  primary: 'bg-accent-green/10 text-accent-green',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
}

const dotStyles: Record<BadgeVariant, string> = {
  default: 'bg-text-secondary',
  primary: 'bg-accent-green',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
}

// ============================================================================
// Component
// ============================================================================

export const Badge = memo(function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  className = '',
}: BadgeProps) {
  const classes = [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]}`} />
      )}
      {children}
      {removable && (
        <button
          onClick={onRemove}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
})

export default Badge
