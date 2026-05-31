/**
 * API Client with automatic token refresh and error handling
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';


export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
  message?: string;
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}


export class ApiError extends Error {
  statusCode: number;
  errors?: string[];

  constructor(message: string, statusCode: number, errors?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

export class AuthError extends ApiError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthError';
  }
}


let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let onAuthError: (() => void) | null = null;

export function setAuthErrorHandler(handler: () => void): void {
  onAuthError = handler;
}

async function refreshToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    return response.ok;
  } catch (error) {
    console.error('[client] Failed to refresh token:', error);
    return false;
  }
}

async function handleTokenRefresh(): Promise<boolean> {
  if (isRefreshing) {
    return refreshPromise!;
  }

  isRefreshing = true;
  refreshPromise = refreshToken();

  try {
    const success = await refreshPromise;
    return success;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}


async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const url = `${API_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const config: RequestInit = {
    ...fetchOptions,
    headers,
    credentials: 'include',
  };

  let response = await fetch(url, config);

  if (response.status === 401 && !skipAuth) {
    const refreshed = await handleTokenRefresh();
    
    if (refreshed) {
      response = await fetch(url, config);
    } else {
      if (onAuthError) {
        onAuthError();
      }
      throw new AuthError('Session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    let errorData: ApiResponse;
    try {
      errorData = await response.json();
    } catch (error) {
      console.error('[client] Failed to parse error response body as JSON:', error);
      throw new ApiError(
        `Request failed with status ${response.status}`,
        response.status
      );
    }

    throw new ApiError(
      errorData.error || 'Request failed',
      response.status,
      errorData.errors
    );
  }

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new ApiError(data.error || 'Request failed', response.status);
  }

  return data.data as T;
}


export const api = {
  get: <T>(endpoint: string, options?: RequestOptions): Promise<T> =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestOptions): Promise<T> =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),

  upload: async <T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string>
  ): Promise<T> => {
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData: ApiResponse = await response.json().catch(() => ({
        success: false,
        error: 'Upload failed',
      }));
      throw new ApiError(
        errorData.error || 'Upload failed',
        response.status,
        errorData.errors
      );
    }

    const data: ApiResponse<T> = await response.json();
    return data.data as T;
  },

  download: async (endpoint: string): Promise<Blob> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new ApiError('Download failed', response.status);
    }

    return response.blob();
  },
};

