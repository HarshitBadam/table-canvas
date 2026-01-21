/**
 * Icon Component
 * 
 * SVG icon wrapper with consistent sizing and styling.
 */

import React, { memo } from 'react'

// ============================================================================
// Types
// ============================================================================

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface IconProps {
  /** Icon SVG content (children) */
  children: React.ReactNode
  /** Icon size */
  size?: IconSize
  /** Custom color class */
  colorClass?: string
  /** Additional class names */
  className?: string
  /** Accessibility label */
  label?: string
}

// ============================================================================
// Styles
// ============================================================================

const sizeStyles: Record<IconSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
}

// ============================================================================
// Component
// ============================================================================

export const Icon = memo(function Icon({
  children,
  size = 'md',
  colorClass = 'text-current',
  className = '',
  label,
}: IconProps) {
  const classes = [
    'inline-block flex-shrink-0',
    sizeStyles[size],
    colorClass,
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} role={label ? 'img' : undefined} aria-label={label}>
      {children}
    </span>
  )
})

// ============================================================================
// Common Icons
// ============================================================================

export const PlusIcon = memo(function PlusIcon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </Icon>
  )
})

export const CloseIcon = memo(function CloseIcon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </Icon>
  )
})

export const ChevronDownIcon = memo(function ChevronDownIcon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </Icon>
  )
})

export const SearchIcon = memo(function SearchIcon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </Icon>
  )
})

export const FilterIcon = memo(function FilterIcon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <svg fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    </Icon>
  )
})

export const TableIcon = memo(function TableIcon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </Icon>
  )
})

export const ChartIcon = memo(function ChartIcon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    </Icon>
  )
})

export default Icon
