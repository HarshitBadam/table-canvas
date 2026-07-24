import { useEffect, useLayoutEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([aria-disabled="true"])',
  '[href]',
  'input:not([disabled]):not([aria-disabled="true"])',
  'select:not([disabled]):not([aria-disabled="true"])',
  'textarea:not([disabled]):not([aria-disabled="true"])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const INITIAL_FOCUS_SELECTORS = [
  '[data-dialog-initial-focus]',
  '[autofocus]',
  FOCUSABLE_SELECTOR,
]
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]'

interface DialogEntry {
  dialog: HTMLElement
  onClose: () => void
}

const dialogStack: DialogEntry[] = []

export function isVisibleElement(element: HTMLElement) {
  if (!element.isConnected) return false
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false
  }
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') {
    return false
  }
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function getVisibleFocusableElement() {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.closest('[role="dialog"], [role="alertdialog"]'))
    .find(isVisibleElement) ?? null
}

function getTopmostDialog() {
  for (let index = dialogStack.length - 1; index >= 0; index -= 1) {
    const entry = dialogStack[index]
    if (isVisibleElement(entry.dialog)) return entry
    dialogStack.splice(index, 1)
  }
  return null
}

function hasVisibleModalOutside(dialog: HTMLElement) {
  return Array.from(document.querySelectorAll<HTMLElement>(MODAL_SELECTOR))
    .some((candidate) => (
      candidate !== dialog
      && !candidate.contains(dialog)
      && isVisibleElement(candidate)
    ))
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(isVisibleElement)
}

function getInitialFocusableElement(dialog: HTMLElement) {
  for (const selector of INITIAL_FOCUS_SELECTORS) {
    for (const element of dialog.querySelectorAll<HTMLElement>(selector)) {
      if (isVisibleElement(element)) return element
    }
  }
  return null
}

export function useDialogFocus<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
) {
  const dialogRef = useRef<T>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const returnFocusFrameRef = useRef<number | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useLayoutEffect(() => {
    if (!isOpen) return
    const dialog = dialogRef.current
    if (!dialog) return

    if (returnFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(returnFocusFrameRef.current)
      returnFocusFrameRef.current = null
    }

    const activeElement = document.activeElement
    returnFocusRef.current = activeElement instanceof HTMLElement && isVisibleElement(activeElement)
      ? activeElement
      : null

    const entry: DialogEntry = {
      dialog,
      onClose: () => onCloseRef.current(),
    }
    dialogStack.push(entry)

    const focusInitialControl = () => {
      const initialControl = getInitialFocusableElement(dialog)
      if (initialControl) {
        initialControl.focus()
      } else if (isVisibleElement(dialog)) {
        dialog.focus()
      }
    }
    focusInitialControl()
    const initialFocusFrame = window.requestAnimationFrame(focusInitialControl)

    const handleKeyDown = (event: KeyboardEvent) => {
      const eventDialog = event.target instanceof Element
        ? event.target.closest(DIALOG_SELECTOR)
        : null
      if (
        getTopmostDialog() !== entry
        || hasVisibleModalOutside(dialog)
        || (eventDialog && eventDialog !== dialog)
      ) return

      if (event.key === 'Escape') {
        event.preventDefault()
        entry.onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        if (isVisibleElement(dialog)) dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.cancelAnimationFrame(initialFocusFrame)
      const entryIndex = dialogStack.indexOf(entry)
      if (entryIndex >= 0) dialogStack.splice(entryIndex, 1)
      returnFocusFrameRef.current = window.requestAnimationFrame(() => {
        const element = returnFocusRef.current
        if (element && isVisibleElement(element)) element.focus()
        returnFocusRef.current = null
        returnFocusFrameRef.current = null
      })
    }
  }, [isOpen])

  return dialogRef
}
