/**
 * Badge Component
 * 
 * Atomic badge component for status indicators and labels.
 */

import { ReactNode } from 'react';
import { clsx } from '@/lib/utils';

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-secondary text-text-secondary',
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-success-light text-success-dark',
  warning: 'bg-warning-light text-warning-dark',
  error: 'bg-error-light text-error-dark',
  info: 'bg-info-light text-info-dark',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-xs',
};

export function Badge({
  variant = 'default',
  size = 'md',
  children,
  className,
  dot = false,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-medium rounded-full',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full',
            variant === 'success' && 'bg-success',
            variant === 'warning' && 'bg-warning',
            variant === 'error' && 'bg-error',
            variant === 'info' && 'bg-info',
            variant === 'primary' && 'bg-primary-500',
            variant === 'default' && 'bg-text-tertiary'
          )}
        />
      )}
      {children}
    </span>
  );
}

// Convenience exports for common badge types
export function StatusBadge({ status, children }: { status: 'active' | 'inactive' | 'pending' | 'error'; children: ReactNode }) {
  const variantMap: Record<typeof status, BadgeVariant> = {
    active: 'success',
    inactive: 'default',
    pending: 'warning',
    error: 'error',
  };
  
  return (
    <Badge variant={variantMap[status]} dot>
      {children}
    </Badge>
  );
}
