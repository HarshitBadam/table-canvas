import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface JoinColumnSelectProps {
  value: string
  options: { value: string; label: string; type: string }[]
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel: string
}

export function JoinColumnSelect({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
}: JoinColumnSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0, width: 0 })
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        ref.current
        && !ref.current.contains(target)
        && !popupRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    const focusHandler = (event: FocusEvent) => {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('focusin', focusHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('focusin', focusHandler)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = Math.min(rect.width, window.innerWidth - 16)
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
      const estimatedHeight = 260
      const openAbove = window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight
      setPopupPosition({
        left,
        top: openAbove ? Math.max(8, rect.top - estimatedHeight - 6) : rect.bottom + 6,
        width,
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const selectedIndex = options.findIndex((option) => option.value === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [open, options, value])

  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const selectOption = (optionValue: string) => {
    onChange(optionValue)
    close(true)
  }

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (options.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + options.length) % options.length)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      selectOption(options[activeIndex]?.value ?? options[0].value)
    }
  }

  return (
    <div ref={ref} className="join-select">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
          if (event.key === ' ' && !open) {
            event.preventDefault()
            setOpen(true)
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (open) {
              handleListKeyDown(event)
            } else {
              setOpen(true)
            }
          }
          if (event.key === 'Enter' && open && options.length > 0) {
            event.preventDefault()
            selectOption(options[activeIndex]?.value ?? options[0].value)
          }
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        className="canvas-touch-target join-select-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {selected ? (
          <>
            <span className="join-select-value">{selected.label}</span>
            <span className="join-select-type">{selected.type}</span>
          </>
        ) : (
          <span className="join-select-placeholder">{placeholder}</span>
        )}
        <svg className="join-select-arrow" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z"/>
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          className="join-select-popup"
          style={{
            position: 'fixed',
            left: popupPosition.left,
            top: popupPosition.top,
            right: 'auto',
            width: popupPosition.width,
          }}
        >
          <div id={listboxId} className="join-select-list" role="listbox" aria-label={ariaLabel}>
            {options.map((option, index) => (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => selectOption(option.value)}
                onMouseEnter={() => setActiveIndex(index)}
                onKeyDown={handleListKeyDown}
                className={`join-select-option ${value === option.value ? 'selected' : ''} ${activeIndex === index ? 'active' : ''}`}
              >
                <span className="join-select-option-name">{option.label}</span>
                <span className="join-select-option-type">{option.type}</span>
              </button>
            ))}
          </div>
        </div>,
        ref.current?.closest('[role="dialog"]') ?? document.body,
      )}
    </div>
  )
}
