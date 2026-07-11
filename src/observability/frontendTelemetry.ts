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

declare global {
  interface Window {
    __tableCanvasTelemetry?: TelemetryEnvelope[]
  }
}

const endpoint = import.meta.env.VITE_TELEMETRY_ENDPOINT?.trim()
const sessionId = crypto.randomUUID()
let initialized = false
const recentErrors = new Map<string, number>()

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

  if (!endpoint) return
  const body = JSON.stringify(envelope)
  if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) return
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  })
}

function reportError(
  source: Extract<FrontendTelemetryEvent, { type: 'frontend-error' }>['source'],
  cause: unknown,
) {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  const signature = `${source}:${error.message}`
  const now = Date.now()
  if (now - (recentErrors.get(signature) ?? 0) < 5_000) return
  recentErrors.set(signature, now)
  publish({
    type: 'frontend-error',
    source,
    message: error.message.slice(0, 1_000),
    stack: error.stack?.slice(0, 4_000),
  })
}

export function reportReactError(cause: unknown) {
  reportError('react', cause)
}

export function initializeFrontendTelemetry() {
  if (initialized || !import.meta.env.PROD) return
  initialized = true

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
