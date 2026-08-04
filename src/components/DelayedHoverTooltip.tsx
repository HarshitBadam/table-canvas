import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/** Native title tooltips open after ~1s; doubled so brief passes don't flash labels. */
const TOOLBAR_TOOLTIP_OPEN_DELAY_MS = 2000

type Side = 'top' | 'bottom' | 'left' | 'right'

interface DelayedHoverTooltipProps {
  label: string
  children: ReactNode
  delayMs?: number
  side?: Side
}

export function DelayedHoverTooltip({
  label,
  children,
  delayMs = TOOLBAR_TOOLTIP_OPEN_DELAY_MS,
  side = 'top',
}: DelayedHoverTooltipProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ left: 0, top: 0 })
  const wrapRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const close = () => {
    clearTimer()
    setOpen(false)
  }

  const openSoon = () => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      const el = wrapRef.current
      if (!el) return
      const target = (el.firstElementChild as HTMLElement | null) ?? el
      const rect = target.getBoundingClientRect()
      const gap = 8
      let left = rect.left + rect.width / 2
      let top = rect.top
      if (side === 'top') {
        top = rect.top - gap
      } else if (side === 'bottom') {
        top = rect.bottom + gap
      } else if (side === 'right') {
        left = rect.right + gap
        top = rect.top + rect.height / 2
      } else {
        left = rect.left - gap
        top = rect.top + rect.height / 2
      }
      setCoords({ left, top })
      setOpen(true)
    }, delayMs)
  }

  useEffect(() => () => clearTimer(), [])

  if (!label) return <>{children}</>

  return (
    <span
      ref={wrapRef}
      className="flex"
      onMouseEnter={openSoon}
      onMouseLeave={close}
      onFocusCapture={openSoon}
      onBlurCapture={close}
    >
      {children}
      {open
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-tooltip whitespace-nowrap rounded-md border border-transparent bg-[#1d1d1f] px-2 py-1 text-xs text-white shadow-md dark:border-border dark:bg-surface-tertiary dark:text-text-primary"
              style={{
                left: coords.left,
                top: coords.top,
                transform:
                  side === 'top'
                    ? 'translate(-50%, -100%)'
                    : side === 'bottom'
                      ? 'translate(-50%, 0)'
                      : side === 'right'
                        ? 'translate(0, -50%)'
                        : 'translate(-100%, -50%)',
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
