/**
 * withErrorBoundary HOC
 *
 * Wraps a component in an ErrorBoundary. Kept in its own module so
 * ErrorBoundary.tsx only exports components (required for React Fast Refresh).
 */

import React from 'react';
import { ErrorBoundary, type ErrorBoundaryProps } from './ErrorBoundary';

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary name={displayName} {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}
