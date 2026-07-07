import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';

// ============================================================================
// Types
// ============================================================================

interface ProtectedRouteProps {
  children: ReactNode;
}

// ============================================================================
// Protected Route Component
// ============================================================================

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-text-secondary">
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Save the attempted URL for redirecting after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// ============================================================================
// Public Route Component (redirects to app if already authenticated)
// ============================================================================

interface PublicRouteProps {
  children: ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to app if already authenticated
  if (isAuthenticated) {
    // Redirect to the page they were trying to visit, or home
    const from = (location.state as { from?: Location })?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  return <>{children}</>;
}
