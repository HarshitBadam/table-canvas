/**
 * Button Component
 * 
 * A versatile button component following the design system.
 */

import React, { forwardRef, memo } from 'react'

// ============================================================================
// Types
// ============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: ButtonVariant
  /** Button size */
  size?: ButtonSize
  /** Icon-only button */
  iconOnly?: boolean
  /** Loading state */
  isLoading?: boolean
  /** Left icon */
  leftIcon?: React.ReactNode
  /** Right icon */
  rightIcon?: React.ReactNode
  /** Full width button */
  fullWidth?: boolean
}

// ============================================================================
// Styles
// ============================================================================

const baseStyles = [
  'inline-flex items-center justify-center gap-2',
  'font-medium rounded-md',
  'transition-colors duration-fast',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent-green text-white hover:bg-accent-green-hover focus-visible:ring-accent-green',
  secondary: 'bg-transparent border border-border text-text-primary hover:bg-surface-secondary focus-visible:ring-border-focus',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus-visible:ring-border-focus',
  danger: 'bg-error text-white hover:bg-red-700 focus-visible:ring-error',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

const iconOnlySizeStyles: Record<ButtonSize, string> = {
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-3',
}

// ============================================================================
// Component
// ============================================================================

export const Button = memo(forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconOnly = false,
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className = '',
    disabled,
    children,
    ...props
  },
  ref
) {
  const classes = [
    baseStyles,
    variantStyles[variant],
    iconOnly ? iconOnlySizeStyles[size] : sizeStyles[size],
    fullWidth ? 'w-full' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : leftIcon ? (
        <span className="w-4 h-4">{leftIcon}</span>
      ) : null}
      {!iconOnly && children}
      {rightIcon && !isLoading && (
        <span className="w-4 h-4">{rightIcon}</span>
      )}
    </button>
  )
}))

export default Button
