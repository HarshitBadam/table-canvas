import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, formatApiErrorMessage, refreshSession, setAuthErrorHandler } from '@/api/client'

function rateLimited(headers: Record<string, string> = {}): Response {
  return {
    ok: false,
    status: 429,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => ({ success: false, error: 'Too many requests' }),
  } as unknown as Response
}

function jsonResponse(ok: boolean, status: number, body: unknown = {}): Response {
  return {
    ok,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response
}

/** Minimal Web Locks stand-in: runs the callback immediately, one at a time. */
function fakeLocks(): LockManager {
  let queue: Promise<unknown> = Promise.resolve()
  return {
    request: vi.fn((_name: string, ...rest: unknown[]) => {
      const callback = rest[rest.length - 1] as (lock: unknown) => unknown
      const run = queue.then(() => callback({} as Lock))
      queue = run.catch(() => undefined)
      return run
    }),
  } as unknown as LockManager
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setAuthErrorHandler(null)
})

describe('rate limited responses', () => {
  it('surfaces Retry-After delta-seconds on the error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimited({ 'Retry-After': '7' })))

    const error = await api.get('/projects').catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ statusCode: 429, retryAfterSeconds: 7 })
  })

  it('converts a Retry-After HTTP-date into seconds from now', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      rateLimited({ 'Retry-After': 'Thu, 01 Jan 2026 00:00:30 GMT' }),
    ))

    const error = await api.get('/projects').catch((thrown: unknown) => thrown)

    expect(error).toMatchObject({ statusCode: 429, retryAfterSeconds: 30 })
  })

  it('leaves the delay unset when no Retry-After header is sent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rateLimited()))

    const error = await api.get('/projects').catch((thrown: unknown) => thrown)

    expect(error).toMatchObject({ statusCode: 429, retryAfterSeconds: undefined })
  })
})

describe('refreshSession lock waiter behavior', () => {
  it('reuses another tab\'s cookies via an /auth/me probe instead of rotating again', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: fakeLocks() })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(true, 200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshSession()

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/me')
  })

  it('falls back to rotating the refresh token when the probe finds no valid session', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: fakeLocks() })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(false, 401))
      .mockResolvedValueOnce(jsonResponse(true, 200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshSession()

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/me')
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh')
  })

  it('reports the true rotation failure when neither the probe nor the refresh succeed', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: fakeLocks() })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(false, 401))
      .mockResolvedValueOnce(jsonResponse(false, 401))
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshSession()

    expect(result).toBe(false)
  })

  it('falls back to a direct refresh with no probe when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: undefined })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(true, 200))
    vi.stubGlobal('fetch', fetchMock)

    const result = await refreshSession()

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/refresh')
  })

  it('keeps deduplicating concurrent same-tab callers behind a single in-flight attempt', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: undefined })
    let resolveFetch: (value: Response) => void = () => {}
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>(resolve => { resolveFetch = resolve }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = refreshSession()
    const second = refreshSession()
    resolveFetch(jsonResponse(true, 200))

    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('response ordering semantics for a losing refresh', () => {
  it('does not trigger the auth-error handler when a losing refresh finds the session already valid', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: fakeLocks() })
    const onAuthError = vi.fn()
    setAuthErrorHandler(onAuthError)

    const fetchMock = vi.fn()
      // Initial request that discovers it is unauthenticated.
      .mockResolvedValueOnce(jsonResponse(false, 401))
      // /auth/me probe inside the lock finds cookies another tab already installed.
      .mockResolvedValueOnce(jsonResponse(true, 200))
      // Retried original request now succeeds using the reused cookies.
      .mockResolvedValueOnce(jsonResponse(true, 200, { success: true, data: { ok: true } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.get<{ ok: boolean }>('/projects')

    expect(result).toEqual({ ok: true })
    expect(onAuthError).not.toHaveBeenCalled()
  })

  it('still logs out when the refresh genuinely fails for every tab', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: fakeLocks() })
    const onAuthError = vi.fn()
    setAuthErrorHandler(onAuthError)

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(false, 401))
      .mockResolvedValueOnce(jsonResponse(false, 401))
      .mockResolvedValueOnce(jsonResponse(false, 401))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/projects')).rejects.toMatchObject({ name: 'AuthError' })
    expect(onAuthError).toHaveBeenCalledTimes(1)
  })
})

describe('formatApiErrorMessage', () => {
  it('prefers detailed validation errors from the API', () => {
    expect(
      formatApiErrorMessage(
        new ApiError('Validation failed', 400, ['Invalid project ID format']),
      ),
    ).toBe('Invalid project ID format')
  })
})
