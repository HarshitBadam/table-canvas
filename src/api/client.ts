export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
}

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  timeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 75_000;
const FILE_REQUEST_TIMEOUT_MS = 120_000;

export class ApiError extends Error {
  statusCode: number;
  errors?: string[];
  retryAfterSeconds?: number;

  constructor(
    message: string,
    statusCode: number,
    errors?: string[],
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Prefer server field errors when present (e.g. "Invalid project ID format"). */
export function formatApiErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (error instanceof ApiError) {
    return error.errors?.join(', ') || error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Supports both `Retry-After` forms: delta-seconds and an HTTP-date. */
function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers?.get('Retry-After');
  if (!header) return undefined;

  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
}

class AuthError extends ApiError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthError';
  }
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let onAuthError: (() => void) | null = null;

export function setAuthErrorHandler(handler: (() => void) | null): void {
  onAuthError = handler;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const forwardAbort = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new ApiError('Request timed out. Please try again.', 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}

export async function probeApi(
  endpoint: string,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}${endpoint}`,
      { method: 'GET', credentials: 'omit' },
      timeoutMs,
    );
    return response.ok;
  } catch {
    return false;
  }
}

const AUTH_REFRESH_LOCK_NAME = 'excel-table-app:auth-refresh';

async function refreshToken(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/auth/refresh`,
      {
        method: 'POST',
        credentials: 'include',
      },
      timeoutMs,
    );

    if (response.ok) return true;
    if (response.status === 401 || response.status === 403) return false;
    throw new ApiError('Unable to refresh session', response.status);
  } catch (error) {
    console.error('[client] Failed to refresh token:', error);
    throw error;
  }
}

/** Raw probe (bypasses `request()`) so a 401 here never triggers another refresh. */
async function probeIsAuthenticated(timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/auth/me`,
      { method: 'GET', credentials: 'include' },
      timeoutMs,
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Serializes refresh attempts across tabs with a Web Lock. A tab that loses the
 * race to rotate the refresh token would otherwise get a failure response even
 * though another tab already rotated it successfully. Once this tab acquires
 * the lock, it first probes `/auth/me` with the browser's current cookies: if
 * another tab (the winner) already installed fresh cookies, this tab reuses
 * them instead of attempting a redundant rotation that could fail.
 */
async function refreshSessionAcrossTabs(timeoutMs: number): Promise<boolean> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) {
    // Safe fallback without Web Locks: fall through to a direct refresh. The
    // server-side CAS still protects token rotation; this tab just won't
    // benefit from reusing another tab's winning cookies before retrying.
    return refreshToken(timeoutMs);
  }

  return locks.request(AUTH_REFRESH_LOCK_NAME, { mode: 'exclusive' }, async () => {
    if (await probeIsAuthenticated(timeoutMs)) return true;
    return refreshToken(timeoutMs);
  });
}

export async function refreshSession(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<boolean> {
  if (isRefreshing) {
    return refreshPromise!;
  }

  isRefreshing = true;
  refreshPromise = refreshSessionAcrossTabs(timeoutMs);

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
  const {
    skipAuth = false,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    ...fetchOptions
  } = options;

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

  let response = await fetchWithTimeout(url, config, timeoutMs);

  if (response.status === 401 && !skipAuth) {
    const refreshed = await refreshSession(timeoutMs);

    if (refreshed) {
      response = await fetchWithTimeout(url, config, timeoutMs);
    } else {
      if (onAuthError) {
        onAuthError();
      }
      throw new AuthError('Session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfter(response);
    let errorData: ApiResponse;
    try {
      errorData = await response.json();
    } catch (error) {
      console.error('[client] Failed to parse error response body as JSON:', error);
      throw new ApiError(
        `Request failed with status ${response.status}`,
        response.status,
        undefined,
        retryAfterSeconds
      );
    }

    throw new ApiError(
      errorData.error || 'Request failed',
      response.status,
      errorData.errors,
      retryAfterSeconds
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

  delete: <T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    }),

  upload: async <T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string>,
    operationId?: string
  ): Promise<T> => {
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const config: RequestInit = {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: operationId ? { 'Idempotency-Key': operationId } : undefined,
    };
    let response = await fetchWithTimeout(url, config, FILE_REQUEST_TIMEOUT_MS);
    if (response.status === 401 && await refreshSession(FILE_REQUEST_TIMEOUT_MS)) {
      response = await fetchWithTimeout(url, config, FILE_REQUEST_TIMEOUT_MS);
    }

    if (!response.ok) {
      if (response.status === 401) onAuthError?.()
      const errorData: ApiResponse = await response.json().catch(() => ({
        success: false,
        error: 'Upload failed',
      }));
      throw new ApiError(
        errorData.error || 'Upload failed',
        response.status,
        errorData.errors,
        parseRetryAfter(response)
      );
    }

    const data: ApiResponse<T> = await response.json();
    return data.data as T;
  },

  download: async (endpoint: string): Promise<Blob> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const config: RequestInit = {
      method: 'GET',
      credentials: 'include',
    };
    let response = await fetchWithTimeout(url, config, FILE_REQUEST_TIMEOUT_MS);
    if (response.status === 401 && await refreshSession(FILE_REQUEST_TIMEOUT_MS)) {
      response = await fetchWithTimeout(url, config, FILE_REQUEST_TIMEOUT_MS);
    }

    if (!response.ok) {
      if (response.status === 401) onAuthError?.()
      throw new ApiError('Download failed', response.status);
    }

    return response.blob();
  },
};

