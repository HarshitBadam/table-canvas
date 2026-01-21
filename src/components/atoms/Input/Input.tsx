/**
 * Input Component
 * 
 * A versatile input component following the design system.
 */

import React, { forwardRef, memo } from 'react'

// ============================================================================
// Types
// ============================================================================

export type InputSize = 'sm' | 'md' | 'lg'
export type InputState = 'default' | 'error' | 'success'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input size */
  size?: InputSize
  /** Input state */
  state?: InputState
  /** Left icon/addon */
  leftAddon?: React.ReactNode
  /** Right icon/addon */
  rightAddon?: React.ReactNode
  /** Error message */
  error?: string
  /** Help text */
  helpText?: string
  /** Label */
  label?: string
  /** Full width input */
  fullWidth?: boolean
}

// ============================================================================
// Styles
// ============================================================================

const baseStyles = [
  'w-full bg-surface text-text-primary',
  'border rounded-md',
  'placeholder:text-text-tertiary',
  'transition-colors duration-fast',
  'focus:outline-none focus:ring-1',
  'disabled:bg-surface-secondary disabled:text-text-tertiary disabled:cursor-not-allowed',
].join(' ')

const sizeStyles: Record<InputSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
}

const stateStyles: Record<InputState, string> = {
  default: 'border-border focus:border-border-focus focus:ring-border-focus',
  error: 'border-error focus:border-error focus:ring-error',
  success: 'border-success focus:border-success focus:ring-success',
}

// ============================================================================
// Component
// ============================================================================

export const Input = memo(forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = 'md',
    state = 'default',
    leftAddon,
    rightAddon,
    error,
    helpText,
    label,
    fullWidth = true,
    className = '',
    id,
    ...props
  },
  ref
) {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`
  const actualState = error ? 'error' : state

  const inputClasses = [
    baseStyles,
    sizeStyles[size],
    stateStyles[actualState],
    leftAddon ? 'pl-10' : '',
    rightAddon ? 'pr-10' : '',
    className,
  ].filter(Boolean).join(' ')

  const containerClasses = fullWidth ? 'w-full' : ''

  return (
    <div className={containerClasses}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-text-primary mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {leftAddon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            {leftAddon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={inputClasses}
          {...props}
        />
        {rightAddon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary">
            {rightAddon}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-error mt-1">{error}</p>
      )}
      {helpText && !error && (
        <p className="text-xs text-text-secondary mt-1">{helpText}</p>
      )}
    </div>
  )
}))

export default Input
