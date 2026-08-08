import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ViewMode } from '@/layout/navigation/viewNavigation'
import { completeDiscoveryTours, type User } from '@/api/auth.api'
import {
  DISCOVERY_TOUR_IDS,
  acknowledgeAccountDiscoveryTours,
  cacheAccountDiscoveryTours,
  completeGuestDiscoveryTour,
  normalizeDiscoveryTourState,
  queuePendingAccountDiscoveryTours,
  readCachedAccountDiscoveryTours,
  readGuestDiscoveryTours,
  readPendingAccountDiscoveryTours,
  type DiscoveryTourId,
  type DiscoveryTourState,
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
  user,
  onDiscoveryToursChange,
  children,
}: {
  activeView: ViewMode
  projectId: string | null
  user: User
  onDiscoveryToursChange?: (state: DiscoveryTourState) => void
  children: ReactNode
}) {
  const [activeTour, setActiveTour] = useState<DiscoveryTourDefinition | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [replayVersion, setReplayVersion] = useState(0)
  const [completedTourIds, setCompletedTourIds] = useState<Set<DiscoveryTourId>>(
    () => new Set(resolveCompletedTours(user)),
  )
  const reportMenuOpenedRef = useRef(false)
  const launchedToursRef = useRef(new Set<DiscoveryTourId>())
  const replayToursRef = useRef(new Set<DiscoveryTourId>())
  const identityRef = useRef(`${user.tier}:${user.id}`)
  const onDiscoveryToursChangeRef = useRef(onDiscoveryToursChange)
  onDiscoveryToursChangeRef.current = onDiscoveryToursChange
  const userRef = useRef(user)
  userRef.current = user

  const closePreparedReportMenu = useCallback(() => {
    if (!reportMenuOpenedRef.current) return
    const trigger = visibleAnchor(DISCOVERY_ANCHORS.reportInsertTrigger)
    if (trigger?.getAttribute('aria-expanded') === 'true') trigger.click()
    reportMenuOpenedRef.current = false
  }, [])

  useEffect(() => {
    const identity = `${user.tier}:${user.id}`
    const identityChanged = identityRef.current !== identity
    identityRef.current = identity

    if (identityChanged) {
      closePreparedReportMenu()
      replayToursRef.current.clear()
      setActiveTour(null)
      setStepIndex(0)
    }

    let cancelled = false
    const currentUser = userRef.current
    const completed = resolveCompletedTours(currentUser)
    setCompletedTourIds(new Set(completed))
    launchedToursRef.current.clear()

    if (currentUser.tier === 'guest') {
      return () => { cancelled = true }
    }

    const serverCompleted = new Set(
      normalizeDiscoveryTourState(currentUser.discoveryTours).completedTours,
    )
    const unsynced = completed.filter(tourId => !serverCompleted.has(tourId))
    if (unsynced.length === 0) {
      return () => { cancelled = true }
    }

    const accountId = currentUser.id
    const accountIdentity = `google:${accountId}`
    queuePendingAccountDiscoveryTours(accountId, unsynced)
    void completeDiscoveryTours(completed)
      .then(state => {
        acknowledgeAccountDiscoveryTours(accountId, state.completedTours)
        cacheAccountDiscoveryTours(accountId, state.completedTours)
        onDiscoveryToursChangeRef.current?.(state)
        if (cancelled || identityRef.current !== accountIdentity) return
        setCompletedTourIds(current => new Set([
          ...current,
          ...state.completedTours,
        ]))
      })
      .catch(() => {
        // Pending completion remains local and will retry on the next startup.
      })

    return () => { cancelled = true }
  }, [closePreparedReportMenu, user.id, user.tier])

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
      || (
        completedTourIds.has(tourId)
        && !replayToursRef.current.has(tourId)
      )
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
  }, [activeTour, activeView, completedTourIds, projectId, replayVersion])

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
    replayToursRef.current.delete(activeTour.id)
    setCompletedTourIds(current => new Set(current).add(activeTour.id))
    if (user.tier === 'guest') {
      completeGuestDiscoveryTour(activeTour.id)
    } else {
      const accountIdentity = `google:${user.id}`
      const pending = queuePendingAccountDiscoveryTours(user.id, [activeTour.id])
      const completed = Array.from(new Set([
        ...completedTourIds,
        ...pending,
        activeTour.id,
      ]))
      void completeDiscoveryTours(completed)
        .then(state => {
          acknowledgeAccountDiscoveryTours(user.id, state.completedTours)
          cacheAccountDiscoveryTours(user.id, state.completedTours)
          onDiscoveryToursChangeRef.current?.(state)
          if (identityRef.current !== accountIdentity) return
          setCompletedTourIds(current => new Set([
            ...current,
            ...state.completedTours,
          ]))
        })
        .catch(() => {
          // Optimistic local completion prevents repetition until retry succeeds.
        })
    }
    setActiveTour(null)
    setStepIndex(0)
  }, [activeTour, closePreparedReportMenu, completedTourIds, user])

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
    replayToursRef.current = new Set(DISCOVERY_TOUR_IDS)
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

function resolveCompletedTours(user: User): DiscoveryTourId[] {
  if (user.tier === 'guest') return readGuestDiscoveryTours()
  const serverCompleted = new Set(
    normalizeDiscoveryTourState(user.discoveryTours).completedTours,
  )
  const guestCompleted = new Set(readGuestDiscoveryTours())
  const pendingCompleted = new Set(readPendingAccountDiscoveryTours(user.id))
  const cachedCompleted = new Set(readCachedAccountDiscoveryTours(user.id))
  return DISCOVERY_TOUR_IDS.filter(tourId =>
    serverCompleted.has(tourId)
    || guestCompleted.has(tourId)
    || cachedCompleted.has(tourId)
    || pendingCompleted.has(tourId)
  )
}
