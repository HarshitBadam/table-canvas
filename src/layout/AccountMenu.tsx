import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppAuth } from '@/state/AppContext'
import { focusMenuItem } from '@/lib/focusMenuItem'

function initialsFor(name: string, email: string) {
  const nameParts = name.trim().split(/[\s-]+/).filter(Boolean)
  if (nameParts.length >= 2) {
    return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
  }
  if (nameParts.length === 1) return nameParts[0][0].toUpperCase()
  return email.trim()[0]?.toUpperCase() || '?'
}

export function AccountMenu() {
  const { user, logout } = useAppAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const modalityRef = useRef<'pointer' | 'keyboard'>('pointer')

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open || modalityRef.current !== 'keyboard') return
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
      modalityRef.current = 'pointer'
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  if (!user) return null

  const name = user.name || user.email
  const initials = initialsFor(user.name ?? '', user.email ?? '')

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (!open) return
        if (event.key === 'Escape') {
          event.preventDefault()
          close(true)
          return
        }
        focusMenuItem(event, menuRef.current)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onPointerDown={() => {
          modalityRef.current = 'pointer'
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            modalityRef.current = 'keyboard'
            setOpen(true)
          }
        }}
        onClick={() => setOpen(!open)}
        className="flex h-12 min-w-11 items-center gap-2.5 rounded-md px-1.5 transition-colors hover:bg-surface-secondary md:px-2"
      >
        <Avatar initials={initials} />
        <span className="hidden min-w-0 flex-1 text-left md:block">
          <span className="block text-xs font-medium text-text-tertiary">Account</span>
          <span className="block max-w-[9rem] truncate text-sm font-semibold text-text-primary">
            {name}
          </span>
        </span>
        <svg
          className={`hidden h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-150 md:block ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-popover mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg motion-safe:animate-scale-in"
        >
          <div className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2.5">
            <Avatar initials={initials} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-text-primary">{name}</span>
              <span className="block truncate text-xs text-text-tertiary">{user.email}</span>
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close(false)
              void logout()
            }}
            className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm text-text-primary outline-none transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary"
          >
            <svg className="h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-green text-xs font-semibold text-white"
    >
      {initials}
    </span>
  )
}
