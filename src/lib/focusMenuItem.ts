import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

export function focusMenuItem(
  event: ReactKeyboardEvent,
  container: HTMLElement | null,
): boolean {
  if (!NAVIGATION_KEYS.has(event.key) || !container) return false
  const items = Array.from(
    container.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  )
  if (items.length === 0) return false

  event.preventDefault()
  const currentIndex = items.indexOf(document.activeElement as HTMLElement)
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? items.length - 1
      : event.key === 'ArrowDown'
        ? currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
        : currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length
  items[nextIndex]?.focus()
  return true
}
