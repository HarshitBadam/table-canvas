/**
 * Custom Select Component
 * A styled dropdown using Radix UI with keyboard support and dark mode
 */

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'

// ============================================================================
// Select Root
// ============================================================================

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  children: React.ReactNode
  disabled?: boolean
}

export function Select({ 
  value, 
  onValueChange, 
  placeholder = 'Select...', 
  children,
  disabled = false,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={`
          flex items-center justify-between w-full px-3 py-2 text-sm
          bg-surface border border-border rounded-lg
          hover:border-border-focus focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-border-focus
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-150
          text-text-primary
          data-[placeholder]:text-text-tertiary
        `}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="ml-2 text-text-tertiary">
          <ChevronDownIcon />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={`
            overflow-hidden bg-surface border border-border rounded-lg shadow-lg z-[100]
            animate-in fade-in-0 zoom-in-95
            data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
            data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2
          `}
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1 max-h-[300px] overflow-y-auto">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

// ============================================================================
// Select Item
// ============================================================================

interface SelectItemProps {
  value: string
  children: React.ReactNode
  disabled?: boolean
}

export function SelectItem({ value, children, disabled }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className={`
        relative flex items-center px-3 py-2 text-sm rounded-md cursor-pointer
        select-none outline-none
        text-text-primary
        data-[highlighted]:bg-accent-green/10 data-[highlighted]:text-accent-green
        data-[disabled]:text-text-tertiary data-[disabled]:pointer-events-none
        transition-colors duration-100
      `}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2">
        <CheckIcon />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

// ============================================================================
// Select Group
// ============================================================================

interface SelectGroupProps {
  label: string
  children: React.ReactNode
}

export function SelectGroup({ label, children }: SelectGroupProps) {
  return (
    <SelectPrimitive.Group>
      <SelectPrimitive.Label className="px-3 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wide">
        {label}
      </SelectPrimitive.Label>
      {children}
    </SelectPrimitive.Group>
  )
}

// ============================================================================
// Select Separator
// ============================================================================

export function SelectSeparator() {
  return <SelectPrimitive.Separator className="h-px my-1 bg-border" />
}

// ============================================================================
// Icons
// ============================================================================

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
