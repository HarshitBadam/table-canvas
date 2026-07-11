import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportReactError } from './frontendTelemetry'

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
