import { api, ApiError } from './client';


export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  message: string;
}


export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/login', credentials, {
    skipAuth: true,
  });
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout', undefined, { skipAuth: true });
}

/**
 * Get the current authenticated user
 * Uses skipAuth to prevent automatic token refresh loop
 */
async function getCurrentUser(): Promise<{ user: User }> {
  return api.get<{ user: User }>('/auth/me', { skipAuth: true });
}

async function refreshToken(): Promise<{ user: User }> {
  return api.post<{ user: User }>('/auth/refresh', undefined, {
    skipAuth: true,
  });
}

/**
 * Check if the user is authenticated
 * First tries to get current user, then attempts token refresh if needed
 */
export async function checkAuth(): Promise<User | null> {
  try {
    const { user } = await getCurrentUser();
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      // Access token expired or missing, try to refresh
      try {
        const { user } = await refreshToken();
        return user;
      } catch (error) {
        console.error('[auth] Failed to refresh token during auth check:', error);
        return null;
      }
    }
    // Other error, assume not authenticated
    return null;
  }
}
