/**
 * withFeatureErrorBoundary HOC
 *
 * Wraps a component in a FeatureErrorBoundary. Kept in its own module so
 * FeatureErrorBoundary.tsx only exports components (required for Fast Refresh).
 */

import { FeatureErrorBoundary, type FeatureErrorBoundaryProps } from './FeatureErrorBoundary'

export function withFeatureErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  featureName: string,
  options?: Omit<FeatureErrorBoundaryProps, 'children' | 'featureName'>
) {
  return function WrappedComponent(props: P) {
    return (
      <FeatureErrorBoundary featureName={featureName} {...options}>
        <Component {...props} />
      </FeatureErrorBoundary>
    )
  }
}
