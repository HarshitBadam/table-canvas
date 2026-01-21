/**
 * Input Component
 * 
 * Atomic input component with consistent styling.
 */

import { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { clsx } from '@/lib/utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  label?: string;
  helperText?: string;
  errorMessage?: string;
}

const sizeStyles = {
  sm: 'px-2 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = 'md',
      error = false,
      leftIcon,
      rightIcon,
      label,
      helperText,
      errorMessage,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={clsx(
              'w-full rounded-lg border bg-surface transition-all duration-150',
              'placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-secondary',
              sizeStyles[size],
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error
                ? 'border-error focus:border-error focus:ring-error/20'
                : 'border-border focus:border-primary-500 focus:ring-primary-500/20',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              {rightIcon}
            </div>
          )}
        </div>
        {(helperText || errorMessage) && (
          <p
            className={clsx(
              'mt-1.5 text-xs',
              error ? 'text-error' : 'text-text-tertiary'
            )}
          >
            {error ? errorMessage : helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Search input variant
export const SearchInput = forwardRef<HTMLInputElement, Omit<InputProps, 'leftIcon'>>(
  (props, ref) => {
    return (
      <Input
        ref={ref}
        leftIcon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        }
        placeholder="Search..."
        {...props}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';
