import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ViewMode } from '@/layout/navigation/viewNavigation'
import {
  completeDiscoveryTour,
  isDiscoveryTourComplete,
  resetDiscoveryTours,
  type DiscoveryTourId,
} from './discoveryTourPersistence'
import {
  DISCOVERY_ANCHORS,
  getDiscoveryTour,
  type DiscoveryTourDefinition,
} from './discoveryTourDefinitions'
import { DiscoveryTourOverlay } from './DiscoveryTourOverlay'
import {
  DiscoveryTourContext,
  type DiscoveryTourContextValue,
} from './DiscoveryTourContext'

function tourIdForView(view: ViewMode): DiscoveryTourId | null {
  if (view === 'canvas' || view === 'report') return view
  if (view === 'grid') return 'grid'
  return null
}

function visibleAnchor(anchorId: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>(
    `[data-discovery-anchor="${anchorId}"]`,
  )
  return Array.from(elements).find(element => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  }) ?? null
}

function hasBlockingDialog(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
  )).some(dialog => {
    if (dialog.closest('[data-discovery-tour]')) return false
    const rect = dialog.getBoundingClientRect()
    const style = window.getComputedStyle(dialog)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
  })
}

function surfaceReady(tourId: DiscoveryTourId): boolean {
  if (tourId !== 'grid') return true
  return visibleAnchor(DISCOVERY_ANCHORS.gridSuggestions) !== null
}

export function DiscoveryTourProvider({
  activeView,
  projectId,
  children,
}: {
  activeView: ViewMode
  projectId: string | null
  children: ReactNode
}) {
  const [activeTour, setActiveTour] = useState<DiscoveryTourDefinition | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [replayVersion, setReplayVersion] = useState(0)
  const reportMenuOpenedRef = useRef(false)
  const launchedToursRef = useRef(new Set<DiscoveryTourId>())

  const closePreparedReportMenu = useCallback(() => {
    if (!reportMenuOpenedRef.current) return
    const trigger = visibleAnchor(DISCOVERY_ANCHORS.reportInsertTrigger)
    if (trigger?.getAttribute('aria-expanded') === 'true') trigger.click()
    reportMenuOpenedRef.current = false
  }, [])

  useEffect(() => {
    const currentTourId = tourIdForView(activeView)
    if (activeTour && activeTour.id !== currentTourId) {
      closePreparedReportMenu()
      setActiveTour(null)
      setStepIndex(0)
    }
  }, [activeTour, activeView, closePreparedReportMenu])

  useEffect(() => {
    if (!projectId || activeTour) return
    const tourId = tourIdForView(activeView)
    if (
      !tourId
      || launchedToursRef.current.has(tourId)
      || isDiscoveryTourComplete(tourId)
    ) return

    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const tryStart = () => {
      if (cancelled) return
      attempts += 1
      if (hasBlockingDialog() || !surfaceReady(tourId)) {
        if (attempts < 40) timer = setTimeout(tryStart, 250)
        return
      }
      setStepIndex(0)
      launchedToursRef.current.add(tourId)
      setActiveTour(getDiscoveryTour(tourId))
    }

    timer = setTimeout(tryStart, 450)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [activeTour, activeView, projectId, replayVersion])

  const currentStep = activeTour?.steps[stepIndex]

  useEffect(() => {
    if (currentStep?.prepare !== 'open-report-insert') return
    const trigger = visibleAnchor(DISCOVERY_ANCHORS.reportInsertTrigger)
    if (!trigger || trigger.getAttribute('aria-expanded') === 'true') return

    trigger.click()
    reportMenuOpenedRef.current = true
    return closePreparedReportMenu
  }, [closePreparedReportMenu, currentStep])

  const finishTour = useCallback(() => {
    if (!activeTour) return
    closePreparedReportMenu()
    completeDiscoveryTour(activeTour.id)
    setActiveTour(null)
    setStepIndex(0)
  }, [activeTour, closePreparedReportMenu])

  const handleNext = useCallback(() => {
    if (!activeTour) return
    if (stepIndex >= activeTour.steps.length - 1) {
      finishTour()
      return
    }
    setStepIndex(index => index + 1)
  }, [activeTour, finishTour, stepIndex])

  const replayAllTours = useCallback(() => {
    closePreparedReportMenu()
    resetDiscoveryTours()
    launchedToursRef.current.clear()
    setActiveTour(null)
    setStepIndex(0)
    setReplayVersion(version => version + 1)
  }, [closePreparedReportMenu])

  const contextValue = useMemo<DiscoveryTourContextValue>(() => ({
    replayAllTours,
    activeTourId: activeTour?.id ?? null,
  }), [activeTour?.id, replayAllTours])

  return (
    <DiscoveryTourContext.Provider value={contextValue}>
      {children}
      {activeTour && currentStep && (
        <DiscoveryTourOverlay
          step={currentStep}
          stepIndex={stepIndex}
          stepCount={activeTour.steps.length}
          tourLabel={activeTour.label}
          onBack={() => setStepIndex(index => Math.max(0, index - 1))}
          onNext={handleNext}
          onSkip={finishTour}
        />
      )}
    </DiscoveryTourContext.Provider>
  )
}
