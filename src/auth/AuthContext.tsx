import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  User,
  LoginCredentials,
  RegisterCredentials,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  checkAuth,
} from '@/api/auth.api';
import { setAuthErrorHandler, ApiError } from '@/api/client';

// ============================================================================
// Types
// ============================================================================

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Handle auth errors from API client
  const handleAuthError = useCallback(() => {
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  // Set up auth error handler
  useEffect(() => {
    setAuthErrorHandler(handleAuthError);
  }, [handleAuthError]);

  // Check authentication on mount
  useEffect(() => {
    const init = async () => {
      try {
        const user = await checkAuth();
        setState({
          user,
          isLoading: false,
          isAuthenticated: !!user,
        });
      } catch {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    };

    init();
  }, []);

  // Login
  const login = useCallback(async (credentials: LoginCredentials) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    
    try {
      const { user } = await apiLogin(credentials);
      setState({
        user,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  // Register
  const register = useCallback(async (credentials: RegisterCredentials) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    
    try {
      const { user } = await apiRegister(credentials);
      setState({
        user,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Ignore logout errors
    } finally {
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  // Refresh auth state
  const refreshAuth = useCallback(async () => {
    try {
      const user = await checkAuth();
      setState({
        user,
        isLoading: false,
        isAuthenticated: !!user,
      });
    } catch {
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

// ============================================================================
// Utility Hook for Auth Errors
// ============================================================================

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
