/**
 * createLazyComponent HOC
 *
 * Creates a lazily-loaded component wrapped in a LazyLoad fallback. Kept in its
 * own module so LazyLoad.tsx only exports components (required for Fast Refresh).
 */

import React, { ComponentType, ReactNode, lazy } from 'react';
import { LazyLoad } from './LazyLoad';

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
