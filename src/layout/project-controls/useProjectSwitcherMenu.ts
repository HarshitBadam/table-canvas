import { useCallback, useEffect, useRef, useState } from 'react'

export interface MenuPosition {
  left: number
  top: number
  width: number
  maxHeight: number
}

export interface ActionMenuPosition {
  left: number
  top: number
}

interface ProjectSummary {
  id: string
  name: string
}

/**
 * Owns the switcher's popover mechanics: trigger/menu/action-submenu
 * open state, viewport-aware positioning, outside-click and keyboard
 * dismissal, and roving focus across the listbox. Project data mutations
 * (create/duplicate/delete/rename/switch) live in useProjectSwitcherOperations
 * and are wired to this hook's setters by the ProjectSwitcher shell.
 */
export function useProjectSwitcherMenu() {
  const switcherRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [projectActionsOpen, setProjectActionsOpen] = useState(false)
  const [projectActionsPosition, setProjectActionsPosition] = useState<ActionMenuPosition | null>(null)
  const [actionProjectId, setActionProjectId] = useState<string | null>(null)
  const [actionProjectName, setActionProjectName] = useState('')

  const focusTrigger = useCallback(() => {
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const gutter = 12
    const width = Math.min(288, window.innerWidth - gutter * 2)
    const availableBelow = window.innerHeight - rect.bottom - gutter
    const availableAbove = rect.top - gutter
    const openAbove = availableBelow < 280 && availableAbove > availableBelow
    const maxHeight = Math.max(220, Math.min(420, openAbove ? availableAbove : availableBelow))
    setMenuPosition({
      left: Math.min(Math.max(rect.left, gutter), window.innerWidth - width - gutter),
      top: openAbove
        ? Math.max(gutter, rect.top - maxHeight - 6)
        : rect.bottom + 6,
      width,
      maxHeight,
    })
  }, [])

  const openMenu = useCallback(() => {
    updateMenuPosition()
    setMenuOpen(true)
  }, [updateMenuPosition])

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      setMenuOpen(false)
      setIsRenaming(false)
    } else {
      openMenu()
    }
  }, [menuOpen, openMenu])

  const focusProjectOption = useCallback((position: 'last' | 'active') => {
    requestAnimationFrame(() => {
      const options = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
      )
      if (options.length === 0) return
      if (position === 'last') {
        options.at(-1)?.focus()
        return
      }
      const active = options.find(option => option.getAttribute('aria-selected') === 'true')
      ;(active ?? options[0]).focus()
    })
  }, [])

  const handleTriggerKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu()
      focusProjectOption(event.key === 'ArrowDown' ? 'active' : 'last')
    }
  }, [openMenu, focusProjectOption])

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"], [role="menuitem"]',
      ),
    )
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      options[(currentIndex + 1 + options.length) % options.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      options[(currentIndex - 1 + options.length) % options.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      options[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      options.at(-1)?.focus()
    }
  }, [])

  const toggleProjectActions = useCallback((project: ProjectSummary, rect: DOMRect) => {
    if (projectActionsOpen && actionProjectId === project.id) {
      setProjectActionsOpen(false)
      return
    }
    const actionMenuWidth = 176
    const actionMenuHeight = 132
    const gutter = 12
    const outwardLeft = rect.right
    const opensOutward = outwardLeft + actionMenuWidth <= window.innerWidth - gutter
    const alignedLeft = opensOutward
      ? outwardLeft
      : Math.max(gutter, rect.left - actionMenuWidth)
    setActionProjectId(project.id)
    setActionProjectName(project.name)
    setProjectActionsPosition({
      left: alignedLeft,
      top: Math.min(
        Math.max(gutter, rect.top),
        window.innerHeight - actionMenuHeight - gutter,
      ),
    })
    setProjectActionsOpen(true)
  }, [actionProjectId, projectActionsOpen])

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !switcherRef.current?.contains(target)
        && !menuRef.current?.contains(target)
        && !actionMenuRef.current?.contains(target)
      ) {
        setMenuOpen(false)
        setIsRenaming(false)
        setProjectActionsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (projectActionsOpen) {
          setProjectActionsOpen(false)
          return
        }
        if (isRenaming) {
          setIsRenaming(false)
          return
        }
        setMenuOpen(false)
        focusTrigger()
      }
    }
    const handleViewportChange = () => {
      updateMenuPosition()
      setProjectActionsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [focusTrigger, isRenaming, menuOpen, projectActionsOpen, updateMenuPosition])

  return {
    switcherRef,
    triggerRef,
    menuRef,
    actionMenuRef,
    menuOpen,
    setMenuOpen,
    menuPosition,
    openMenu,
    toggleMenu,
    focusTrigger,
    handleTriggerKeyDown,
    handleMenuKeyDown,
    isRenaming,
    setIsRenaming,
    projectActionsOpen,
    setProjectActionsOpen,
    projectActionsPosition,
    actionProjectId,
    actionProjectName,
    toggleProjectActions,
  }
}
