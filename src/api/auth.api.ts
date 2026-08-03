import { api, ApiError, refreshSession } from './client';


export interface User {
  id: string;
  email: string;
  name: string;
  tier: 'guest' | 'google';
  avatarUrl?: string;
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

export async function loginWithGoogle(credential: string): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/google', { credential }, {
    skipAuth: true,
  });
}

/** Uses skipAuth so a 401 on /auth/me does not trigger the client's refresh loop. */
async function getCurrentUser(): Promise<{ user: User }> {
  return api.get<{ user: User }>('/auth/me', { skipAuth: true });
}

export async function checkAuth(): Promise<User | null> {
  try {
    const { user } = await getCurrentUser();
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      try {
        if (!await refreshSession()) return null;
        const { user } = await getCurrentUser();
        return user;
      } catch (error) {
        console.error('[auth] Failed to refresh token during auth check:', error);
        return null;
      }
    }
    return null;
  }
}
