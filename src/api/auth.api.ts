import { api, ApiError, probeApi, refreshSession } from './client';

const AUTH_BOOT_TIMEOUT_MS = 3_000;


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

export interface AuthCheckResult {
  user: User | null;
  backendReachable: boolean;
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

export async function logout(): Promise<void> {
  await api.post('/auth/logout', undefined, { skipAuth: true });
}

export async function warmBackend(): Promise<boolean> {
  return probeApi('/health');
}

async function getCurrentUser(timeoutMs: number): Promise<{ user: User }> {
  return api.get<{ user: User }>('/auth/me', {
    skipAuth: true,
    timeoutMs,
  });
}

export async function checkAuth(): Promise<AuthCheckResult> {
  try {
    const { user } = await getCurrentUser(AUTH_BOOT_TIMEOUT_MS);
    return { user, backendReachable: true };
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      try {
        if (!await refreshSession(AUTH_BOOT_TIMEOUT_MS)) {
          return { user: null, backendReachable: true };
        }
        const { user } = await getCurrentUser(AUTH_BOOT_TIMEOUT_MS);
        return { user, backendReachable: true };
      } catch (refreshError) {
        console.error('[auth] Failed to refresh token during auth check:', refreshError);
        return { user: null, backendReachable: true };
      }
    }
    return {
      user: null,
      backendReachable: error instanceof ApiError && error.statusCode !== 408,
    };
  }
}
