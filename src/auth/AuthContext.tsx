import {
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  LoginCredentials,
  RegisterCredentials,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  checkAuth,
} from '@/api/auth.api';
import { setAuthErrorHandler } from '@/api/client';
import { AuthContext, type AuthState, type AuthContextValue } from './authContext';

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
