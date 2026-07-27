import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

type FrontendTelemetryEvent =
  | {
      type: 'web-vital'
      name: Metric['name']
      value: number
      rating: Metric['rating']
      delta: number
      metricId: string
      navigationType: Metric['navigationType']
    }
  | {
      type: 'frontend-error'
      source: 'error' | 'unhandledrejection' | 'react'
      message: string
      stack?: string
    }

type TelemetryEnvelope = FrontendTelemetryEvent & {
  timestamp: string
  route: string
  sessionId: string
}

type ErrorSource = Extract<FrontendTelemetryEvent, { type: 'frontend-error' }>['source']

declare global {
  interface Window {
    __tableCanvasTelemetry?: TelemetryEnvelope[]
  }
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim()
const telemetryEnabled = import.meta.env.PROD
  || import.meta.env.VITE_ENABLE_FRONTEND_TELEMETRY === 'true'
const sessionId = crypto.randomUUID()
const DEDUPE_WINDOW_MS = 5_000
let initialized = false
const recentErrors = new Map<string, number>()

let captureException: typeof import('@sentry/browser').captureException | null = null
// Errors can fire before the lazily loaded SDK chunk resolves, and the earliest
// failures are usually the interesting ones. Hold a bounded backlog rather than
// dropping them or letting a broken page grow the list without limit.
const pendingCaptures: { error: Error; source: ErrorSource }[] = []
const MAX_PENDING_CAPTURES = 20

function publish(event: FrontendTelemetryEvent) {
  const envelope: TelemetryEnvelope = {
    ...event,
    timestamp: new Date().toISOString(),
    route: window.location.pathname,
    sessionId,
  }
  const buffer = window.__tableCanvasTelemetry ?? []
  buffer.push(envelope)
  if (buffer.length > 100) buffer.shift()
  window.__tableCanvasTelemetry = buffer
  window.dispatchEvent(new CustomEvent('tablecanvas:telemetry', { detail: envelope }))
}

function captureRemotely(error: Error, source: ErrorSource) {
  if (!sentryDsn) return
  if (!captureException) {
    if (pendingCaptures.length < MAX_PENDING_CAPTURES) pendingCaptures.push({ error, source })
    return
  }
  captureException(error, {
    tags: { source },
    extra: { route: window.location.pathname, sessionId },
  })
}

async function loadSentry(dsn: string) {
  try {
    const { startErrorReporting } = await import('./sentryClient')
    captureException = startErrorReporting(dsn)
    for (const { error, source } of pendingCaptures.splice(0)) captureRemotely(error, source)
  } catch {
    // An ad blocker or a failed chunk request must not take the app down with it.
    pendingCaptures.length = 0
  }
}

function reportError(source: ErrorSource, cause: unknown) {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  const signature = `${source}:${error.message}`
  const now = Date.now()
  if (now - (recentErrors.get(signature) ?? 0) < DEDUPE_WINDOW_MS) return
  for (const [seen, at] of recentErrors) {
    if (now - at >= DEDUPE_WINDOW_MS) recentErrors.delete(seen)
  }
  recentErrors.set(signature, now)
  publish({
    type: 'frontend-error',
    source,
    message: error.message.slice(0, 1_000),
    stack: error.stack?.slice(0, 4_000),
  })
  captureRemotely(error, source)
}

export function reportReactError(cause: unknown) {
  reportError('react', cause)
}

export function initializeFrontendTelemetry() {
  if (initialized || !telemetryEnabled) return
  initialized = true

  if (sentryDsn) void loadSentry(sentryDsn)

  // Web vitals stay in the local buffer only. Their job is to enforce the
  // performance budget asserted by the UX end-to-end suite, which needs no
  // remote collector and no sampling quota.
  const reportMetric = (metric: Metric) => publish({
    type: 'web-vital',
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    metricId: metric.id,
    navigationType: metric.navigationType,
  })
  onCLS(reportMetric)
  onFCP(reportMetric)
  onINP(reportMetric)
  onLCP(reportMetric)
  onTTFB(reportMetric)

  window.addEventListener('error', event => reportError('error', event.error ?? event.message))
  window.addEventListener('unhandledrejection', event => {
    reportError('unhandledrejection', event.reason)
  })
}
