import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0, width: 0 })
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => {
    if (!search) return options
    const query = search.toLowerCase()
    return options.filter((option) => option.label.toLowerCase().includes(query))
  }, [options, search])

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
        setSearch('')
      }
    }
    const focusHandler = (event: FocusEvent) => {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false)
        setSearch('')
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
    const selectedIndex = filtered.findIndex((option) => option.value === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    inputRef.current?.focus()
  }, [filtered, open, value])

  const close = (restoreFocus = false) => {
    setOpen(false)
    setSearch('')
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
    if (filtered.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + filtered.length) % filtered.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      selectOption(filtered[activeIndex]?.value ?? filtered[0].value)
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
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
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
          <div className="join-select-search-wrap">
            <svg className="join-select-search-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l2.79 2.79a.75.75 0 11-1.06 1.06l-2.79-2.79z"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search columns"
              aria-label={`Search ${ariaLabel.toLowerCase()}`}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={filtered.length > 0 ? `${listboxId}-option-${activeIndex}` : undefined}
              onKeyDown={handleListKeyDown}
              className="join-select-search"
            />
          </div>
          <div id={listboxId} className="join-select-list" role="listbox" aria-label={ariaLabel}>
            {filtered.length === 0 ? (
              <div className="join-select-empty">No columns match this search.</div>
            ) : filtered.map((option, index) => (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => selectOption(option.value)}
                onMouseEnter={() => setActiveIndex(index)}
                onKeyDown={handleListKeyDown}
                className={`join-select-option ${value === option.value ? 'selected' : ''} ${index === activeIndex ? 'bg-surface-secondary' : ''}`}
              >
                <span className="join-select-option-name">{option.label}</span>
                <span className="join-select-option-type">{option.type}</span>
                {value === option.value && (
                  <svg className="join-select-check" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>,
        ref.current?.closest('[role="dialog"]') ?? document.body,
      )}
    </div>
  )
}
