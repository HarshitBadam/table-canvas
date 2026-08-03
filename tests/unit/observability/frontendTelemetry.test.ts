import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportReactError } from '@/observability/frontendTelemetry'

const DSN = 'https://public-key@o1.ingest.us.sentry.io/2'

beforeEach(() => {
  window.__tableCanvasTelemetry = []
})

describe('frontend telemetry', () => {
  it('records a bounded, structured React error without requiring a remote endpoint', () => {
    const listener = vi.fn()
    window.addEventListener('tablecanvas:telemetry', listener)

    reportReactError(new Error('render failed for telemetry test'))

    expect(window.__tableCanvasTelemetry).toHaveLength(1)
    expect(window.__tableCanvasTelemetry?.[0]).toMatchObject({
      type: 'frontend-error',
      source: 'react',
      message: 'render failed for telemetry test',
    })
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('tablecanvas:telemetry', listener)
  })

  it('deduplicates an error burst to avoid telemetry loops', () => {
    reportReactError(new Error('repeated telemetry failure'))
    reportReactError(new Error('repeated telemetry failure'))

    expect(window.__tableCanvasTelemetry).toHaveLength(1)
  })
})

describe('remote error reporting', () => {
  const startErrorReporting = vi.fn()
  const captureException = vi.fn()
  let loadClient: () => Promise<unknown>

  beforeEach(() => {
    vi.resetModules()
    startErrorReporting.mockClear().mockReturnValue(captureException)
    captureException.mockClear()
    loadClient = async () => ({ startErrorReporting })
    vi.doMock('@/observability/sentryClient', () => loadClient())
    vi.doMock('web-vitals', () => ({
      onCLS: vi.fn(), onFCP: vi.fn(), onINP: vi.fn(), onLCP: vi.fn(), onTTFB: vi.fn(),
    }))
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', '')
  })

  afterEach(() => {
    vi.doUnmock('@/observability/sentryClient')
    vi.doUnmock('web-vitals')
    vi.unstubAllEnvs()
  })

  it('forwards an error to Sentry with its source and route', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const telemetry = await import('@/observability/frontendTelemetry')
    telemetry.initializeFrontendTelemetry()
    await vi.waitFor(() => expect(startErrorReporting).toHaveBeenCalledWith(DSN))

    telemetry.reportReactError(new Error('grid crashed'))

    expect(captureException).toHaveBeenCalledOnce()
    const [error, context] = captureException.mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('grid crashed')
    expect(context).toMatchObject({ tags: { source: 'react' } })
  })

  it('flushes errors raised before the SDK chunk resolved', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    let release: (value: unknown) => void = () => {}
    const blocked = new Promise(resolve => { release = resolve })
    loadClient = async () => {
      await blocked
      return { startErrorReporting }
    }

    const telemetry = await import('@/observability/frontendTelemetry')
    telemetry.initializeFrontendTelemetry()
    telemetry.reportReactError(new Error('crashed during boot'))
    expect(captureException).not.toHaveBeenCalled()

    release(undefined)
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledOnce())
    expect(captureException.mock.calls[0][0].message).toBe('crashed during boot')
  })

  it('keeps working when the SDK chunk cannot be loaded', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    loadClient = async () => { throw new Error('blocked by content blocker') }

    const telemetry = await import('@/observability/frontendTelemetry')
    expect(() => telemetry.initializeFrontendTelemetry()).not.toThrow()
    telemetry.reportReactError(new Error('still recorded locally'))

    expect(window.__tableCanvasTelemetry).toHaveLength(1)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('never loads the SDK when no DSN is configured', async () => {
    const telemetry = await import('@/observability/frontendTelemetry')
    telemetry.initializeFrontendTelemetry()
    telemetry.reportReactError(new Error('local only'))

    await vi.waitFor(() => expect(window.__tableCanvasTelemetry).toHaveLength(1))
    expect(startErrorReporting).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('allows an explicit local integration-test opt-in', async () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_ENABLE_FRONTEND_TELEMETRY', 'true')
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const telemetry = await import('@/observability/frontendTelemetry')

    telemetry.initializeFrontendTelemetry()

    await vi.waitFor(() => expect(startErrorReporting).toHaveBeenCalledWith(DSN))
  })
})
