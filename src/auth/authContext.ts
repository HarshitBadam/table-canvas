/**
 * Auth context object and hooks.
 *
 * Kept separate from AuthContext.tsx (which exports the AuthProvider component)
 * so that the provider file only exports components, as required for React Fast
 * Refresh to work reliably.
 */

import { createContext, useContext, useState, useCallback } from 'react';
import type { User, LoginCredentials, RegisterCredentials } from '@/api/auth.api';
import { ApiError } from '@/api/client';

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export function useAuthError() {
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.errors && err.errors.length > 0) {
        setError(err.errors.join('. '));
      } else {
        setError(err.message);
      }
    } else if (err instanceof Error) {
      setError(err.message);
    } else {
      setError('An unexpected error occurred');
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { error, setError: handleError, clearError };
}
