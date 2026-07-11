import { useEffect, useId, useMemo, useRef, useState } from 'react'

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
  const listboxId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => {
    if (!search) return options
    const query = search.toLowerCase()
    return options.filter((option) => option.label.toLowerCase().includes(query))
  }, [options, search])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div ref={ref} className="join-select">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className="join-select-btn"
      >
        {selected ? (
          <>
            <span className="join-select-value">{selected.label}</span>
            <span className="join-select-type">{selected.type}</span>
          </>
        ) : (
          <span className="join-select-placeholder">{placeholder}</span>
        )}
        <svg className="join-select-arrow" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z"/>
        </svg>
      </button>

      {open && (
        <div className="join-select-popup">
          <div className="join-select-search-wrap">
            <svg className="join-select-search-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l2.79 2.79a.75.75 0 11-1.06 1.06l-2.79-2.79z"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search columns..."
              aria-label={`Search ${ariaLabel.toLowerCase()}`}
              className="join-select-search"
            />
          </div>
          <div id={listboxId} className="join-select-list" role="listbox" aria-label={ariaLabel}>
            {filtered.length === 0 ? (
              <div className="join-select-empty">No columns found</div>
            ) : filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  setSearch('')
                }}
                className={`join-select-option ${value === option.value ? 'selected' : ''}`}
              >
                <span className="join-select-option-name">{option.label}</span>
                <span className="join-select-option-type">{option.type}</span>
                {value === option.value && (
                  <svg className="join-select-check" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
