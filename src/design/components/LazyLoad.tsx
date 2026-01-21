/**
 * LazyLoad Component
 * 
 * Suspense wrapper with loading fallback for lazy-loaded components.
 */

import { Suspense, ReactNode, ComponentType, lazy } from 'react';
import { clsx } from '@/lib/utils';

// ============================================================================
// Loading Fallback
// ============================================================================

interface LoadingFallbackProps {
  message?: string;
  className?: string;
  compact?: boolean;
}

export function LoadingFallback({ message = 'Loading...', className, compact }: LoadingFallbackProps) {
  if (compact) {
    return (
      <div className={clsx('flex items-center gap-2 p-2 text-text-secondary', className)}>
        <LoadingSpinner className="w-4 h-4" />
        <span className="text-xs">{message}</span>
      </div>
    );
  }

  return (
    <div className={clsx(
      'flex flex-col items-center justify-center min-h-[200px] p-6',
      className
    )}>
      <LoadingSpinner className="w-8 h-8 text-primary-500 mb-3" />
      <span className="text-sm text-text-secondary">{message}</span>
    </div>
  );
}

// ============================================================================
// Loading Spinner
// ============================================================================

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('animate-spin', className)}
      fill="none"
      viewBox="0 0 24 24"
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
  );
}

// ============================================================================
// Suspense Wrapper
// ============================================================================

interface LazyLoadProps {
  children: ReactNode;
  fallback?: ReactNode;
  message?: string;
  compact?: boolean;
}

export function LazyLoad({ 
  children, 
  fallback, 
  message = 'Loading...',
  compact,
}: LazyLoadProps) {
  const defaultFallback = <LoadingFallback message={message} compact={compact} />;
  
  return (
    <Suspense fallback={fallback || defaultFallback}>
      {children}
    </Suspense>
  );
}

// ============================================================================
// HOC for creating lazy components with fallback
// ============================================================================

interface LazyComponentOptions {
  fallbackMessage?: string;
  compact?: boolean;
  fallback?: ReactNode;
}

export function createLazyComponent<T extends ComponentType<object>>(
  importFn: () => Promise<{ default: T }>,
  options: LazyComponentOptions = {}
): ComponentType<React.ComponentProps<T>> {
  const LazyComponent = lazy(importFn);
  
  const { fallbackMessage = 'Loading component...', compact, fallback } = options;
  
  const WrappedComponent = (props: React.ComponentProps<T>) => (
    <LazyLoad message={fallbackMessage} compact={compact} fallback={fallback}>
      {/* @ts-expect-error - Generic component props are difficult to type correctly */}
      <LazyComponent {...props} />
    </LazyLoad>
  );
  
  return WrappedComponent;
}
