import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startErrorReporting } from '@/observability/sentryClient'

const { init, captureException } = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@sentry/browser', () => ({
  init,
  captureException,
  inboundFiltersIntegration: () => ({ name: 'InboundFilters' }),
  functionToStringIntegration: () => ({ name: 'FunctionToString' }),
  linkedErrorsIntegration: () => ({ name: 'LinkedErrors' }),
  dedupeIntegration: () => ({ name: 'Dedupe' }),
}))

const DSN = 'https://public-key@o1.ingest.us.sentry.io/2'

beforeEach(() => {
  init.mockClear()
})

describe('Sentry client configuration', () => {
  it('returns the capture function bound to the given DSN', () => {
    expect(startErrorReporting(DSN)).toBe(captureException)
    expect(init.mock.calls[0][0]).toMatchObject({ dsn: DSN })
  })

  it('installs no window hooks of its own, so a failure is reported once', () => {
    startErrorReporting(DSN)

    const options = init.mock.calls[0][0]
    expect(options.defaultIntegrations).toBe(false)
    const names = options.integrations.map((item: { name: string }) => item.name)
    expect(names).not.toContain('GlobalHandlers')
    expect(names).not.toContain('BrowserApiErrors')
  })

  it('collects no breadcrumbs and no personally identifying request data', () => {
    startErrorReporting(DSN)

    const options = init.mock.calls[0][0]
    expect(options.sendDefaultPii).toBe(false)
    const names = options.integrations.map((item: { name: string }) => item.name)
    expect(names).not.toContain('Breadcrumbs')
    expect(names).not.toContain('HttpContext')
  })
})
