import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'

function rateLimited(headers: Record<string, string> = {}): Response {
  return {
    ok: false,
    status: 429,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => ({ success: false, error: 'Too many requests' }),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
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
