import { useLayoutEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '@/components/useDialogFocus'
import type { DiscoveryTourStep } from './discoveryTourDefinitions'
import { findVisibleAnchor } from './discoveryAnchorDom'
import { DiscoveryStepVisual } from './DiscoveryStepVisual'

interface DiscoveryTourOverlayProps {
  step: DiscoveryTourStep
  stepIndex: number
  stepCount: number
  tourLabel: string
  onBack: () => void
  onNext: () => void
  onSkip: () => void
}

interface TargetRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

const SPOTLIGHT_PADDING = 2
const CARD_GAP = 16
const VIEWPORT_MARGIN = 16

function useTargetRect(anchorIds: readonly string[] | undefined, stepId: string) {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)

  useLayoutEffect(() => {
    if (!anchorIds?.length) {
      setTargetRect(null)
      return
    }

    let rafId: number | null = null

    const measure = () => {
      const anchor = findVisibleAnchor(anchorIds)
      if (!anchor) {
        setTargetRect(null)
        return
      }
      const rect = anchor.getBoundingClientRect()
      setTargetRect(previous => (
        previous
        && previous.top === rect.top
        && previous.left === rect.left
        && previous.width === rect.width
        && previous.height === rect.height
      ) ? previous : {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      })
    }

    // A resize/mutation/observer only fires when the browser thinks something
    // relevant changed, but pure layout reflows (sidebar/panel transitions, the
    // browser's own fullscreen chrome animation, etc.) can shift an anchor's
    // position frame-by-frame without ever firing those callbacks. Polling every
    // animation frame is the only way to keep the spotlight glued to the target
    // through all of that, and the bail-out above keeps it a no-op re-render when
    // nothing has actually moved.
    const tick = () => {
      measure()
      rafId = window.requestAnimationFrame(tick)
    }

    // Measure synchronously before the first paint of this step — otherwise the
    // previous step's (stale) target rect, or an initial null, briefly renders
    // before the first rAF tick lands, producing a one-frame flicker whenever a
    // tour first opens or advances between steps.
    measure()
    rafId = window.requestAnimationFrame(tick)

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
    }
  }, [anchorIds, stepId])

  return targetRect
}

function getCardPosition(target: TargetRect | null, measuredHeight: number): CSSProperties {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const width = Math.min(360, viewportWidth - VIEWPORT_MARGIN * 2)
  const height = Math.min(measuredHeight, viewportHeight - VIEWPORT_MARGIN * 2)

  if (viewportWidth < 640) {
    if (target && target.top > viewportHeight * 0.58) {
      return { left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN, width }
    }
    return { left: VIEWPORT_MARGIN, bottom: VIEWPORT_MARGIN, width }
  }

  if (!target) {
    return {
      left: '50%',
      top: '50%',
      width,
      transform: 'translate(-50%, -50%)',
    }
  }

  const clampedTop = Math.max(
    VIEWPORT_MARGIN,
    Math.min(target.top, viewportHeight - height - VIEWPORT_MARGIN),
  )
  if (viewportWidth - target.right >= width + CARD_GAP + VIEWPORT_MARGIN) {
    return {
      left: target.right + CARD_GAP,
      top: clampedTop,
      width,
    }
  }
  if (target.left >= width + CARD_GAP + VIEWPORT_MARGIN) {
    return {
      left: target.left - width - CARD_GAP,
      top: clampedTop,
      width,
    }
  }
  if (viewportHeight - target.bottom >= height + CARD_GAP + VIEWPORT_MARGIN) {
    return {
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(target.left, viewportWidth - width - VIEWPORT_MARGIN),
      ),
      top: target.bottom + CARD_GAP,
      width,
    }
  }
  return {
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(target.left, viewportWidth - width - VIEWPORT_MARGIN),
    ),
    top: Math.max(VIEWPORT_MARGIN, target.top - height - CARD_GAP),
    width,
  }
}

export function DiscoveryTourOverlay({
  step,
  stepIndex,
  stepCount,
  tourLabel,
  onBack,
  onNext,
  onSkip,
}: DiscoveryTourOverlayProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onSkip)
  const [cardHeight, setCardHeight] = useState(320)
  const targetRect = useTargetRect(step.anchorIds, step.id)
  const titleId = `discovery-tour-title-${step.id}`
  const descriptionId = `discovery-tour-description-${step.id}`
  const cardPosition = useMemo(
    () => getCardPosition(targetRect, cardHeight),
    [cardHeight, targetRect],
  )
  const lastStep = stepIndex === stepCount - 1
  const portalRoot = typeof document === 'undefined' ? null : document.body

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    let rafId: number | null = null
    const measure = () => {
      const nextHeight = dialog.getBoundingClientRect().height
      if (nextHeight > 0) {
        setCardHeight(current => Math.abs(current - nextHeight) < 1 ? current : nextHeight)
      }
    }
    const tick = () => {
      measure()
      rafId = window.requestAnimationFrame(tick)
    }
    // See useTargetRect above — measuring synchronously here avoids a one-frame
    // flicker using the previous step's card height before the rAF loop kicks in.
    measure()
    rafId = window.requestAnimationFrame(tick)

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
    }
  }, [dialogRef, step.id])

  if (!portalRoot) return null

  return createPortal(
    <div className="fixed inset-0 z-[1100]" data-discovery-tour={tourLabel.toLowerCase()}>
      <div className={`absolute inset-0 ${targetRect ? '' : 'bg-black/35 dark:bg-black/55'}`} />

      {targetRect && (
        <div
          className="pointer-events-none fixed rounded-md bg-accent-green/[0.08] shadow-[0_0_0_9999px_rgba(15,23,20,0.26)] dark:bg-accent-green/[0.1] dark:shadow-[0_0_0_9999px_rgba(0,0,0,0.48)]"
          style={{
            top: Math.max(VIEWPORT_MARGIN / 2, targetRect.top - SPOTLIGHT_PADDING),
            left: Math.max(VIEWPORT_MARGIN / 2, targetRect.left - SPOTLIGHT_PADDING),
            width: Math.min(
              window.innerWidth - VIEWPORT_MARGIN,
              targetRect.width + SPOTLIGHT_PADDING * 2,
            ),
            height: Math.min(
              window.innerHeight - VIEWPORT_MARGIN,
              targetRect.height + SPOTLIGHT_PADDING * 2,
            ),
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="fixed max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border-elevation bg-surface shadow-2xl outline-none"
        style={cardPosition}
      >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-text">
              {tourLabel} tour
            </span>
            <span className="text-xs tabular-nums text-text-tertiary">
              {stepIndex + 1} of {stepCount}
            </span>
          </div>

          <DiscoveryStepVisual visual={step.visual} />

          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-text-primary">
            {step.title}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-text-secondary">
            {step.description}
          </p>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="mr-auto rounded-lg px-2 py-2 text-xs font-medium text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green"
            >
              Skip tour
            </button>
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={onBack}
                className="btn min-w-20 border-0 bg-surface-secondary text-text-primary hover:bg-surface-tertiary"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              data-dialog-initial-focus
              className="btn btn-primary min-w-20"
            >
              {lastStep ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalRoot,
  )
}
