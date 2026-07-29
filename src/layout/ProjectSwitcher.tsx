import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '@/state/AppContext'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/useWorkspaceLease'
import { CreateProjectDialog, DeleteProjectDialog } from './ProjectDialogs'
import { ProjectSwitcherActions } from './ProjectSwitcherActions'
interface MenuPosition {
  left: number
  top: number
  width: number
  maxHeight: number
}

interface ActionMenuPosition {
  left: number
  top: number
}

interface ProjectSwitcherProps {
  mode?: 'full' | 'switch-only'
}

export function ProjectSwitcher({ mode = 'full' }: ProjectSwitcherProps) {
  const {
    projectId,
    projectName,
    projects,
    isProjectOperationPending,
    user,
    createNewProject,
    duplicateActiveProject,
    deleteProject,
    loadProject,
    renameProject,
    setProjectLimitViolation,
    leaveGuest,
  } = useApp()
  const switcherRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [actionProjectId, setActionProjectId] = useState<string | null>(null)
  const [actionProjectName, setActionProjectName] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showCapacityFeedback, setShowCapacityFeedback] = useState(false)
  const createLockRef = useRef(false)
  const duplicateLockRef = useRef(false)
  const deleteLockRef = useRef(false)
  const [menuActionError, setMenuActionError] = useState<string | null>(null)
  const [projectActionsOpen, setProjectActionsOpen] = useState(false)
  const [projectActionsPosition, setProjectActionsPosition] = useState<ActionMenuPosition | null>(null)
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const { canEdit } = useWorkspaceLease()
  const editBlocked = canEdit ? {} : { disabled: true, title: EDITING_ELSEWHERE_TOOLTIP }
  const pendingProject = projects.find(project => project.id === pendingProjectId)
  const displayedProjectName = pendingProject?.name ?? projectName

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
        requestAnimationFrame(() => triggerRef.current?.focus())
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
  }, [isRenaming, menuOpen, projectActionsOpen, updateMenuPosition])

  const handleCreate = async () => {
    const nextName = name.trim()
    if (!nextName || createLockRef.current) return
    createLockRef.current = true
    setIsCreating(true)
    setError(null)
    setShowCapacityFeedback(false)
    try {
      await createNewProject(nextName)
      setName('')
      setCreateOpen(false)
    } catch (cause) {
      setProjectLimitViolation(null)
      setShowCapacityFeedback(
        typeof cause === 'object' && cause !== null && 'code' in cause
          && cause.code === 'limit',
      )
      setError(cause instanceof Error ? cause.message : 'Could not create project')
    } finally {
      createLockRef.current = false
      setIsCreating(false)
    }
  }

  const handleDuplicate = async () => {
    if (duplicateLockRef.current) return
    duplicateLockRef.current = true
    setIsDuplicating(true)
    setMenuActionError(null)
    try {
      await duplicateActiveProject()
      setMenuOpen(false)
    } catch (cause) {
      setProjectLimitViolation(null)
      setMenuActionError(cause instanceof Error ? cause.message : 'Could not duplicate project')
    } finally {
      duplicateLockRef.current = false
      setIsDuplicating(false)
    }
  }

  const handleDelete = async () => {
    const targetProjectId = actionProjectId ?? projectId
    if (!targetProjectId || deleteLockRef.current) return
    deleteLockRef.current = true
    setIsDeleting(true)
    setError(null)
    try {
      await deleteProject(targetProjectId)
      setDeleteOpen(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete project')
    } finally {
      deleteLockRef.current = false
      setIsDeleting(false)
    }
  }

  const handleSignIn = async () => {
    setError(null)
    try {
      await leaveGuest()
      setCreateOpen(false)
      window.location.assign('/login')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare sign-in')
    }
  }

  const handleRename = () => {
    const nextName = renameName.trim()
    if (!nextName || nextName === actionProjectName) return
    renameProject(nextName)
    setIsRenaming(false)
  }

  const openRenameForProject = async () => {
    if (!actionProjectId) return
    if (actionProjectId !== projectId) {
      await loadProject(actionProjectId)
    }
    setRenameName(actionProjectName)
    setIsRenaming(true)
    setProjectActionsOpen(false)
  }

  const duplicateProjectFromActions = async () => {
    if (actionProjectId && actionProjectId !== projectId) {
      await loadProject(actionProjectId)
    }
    setProjectActionsOpen(false)
    await handleDuplicate()
  }

  const focusProjectOption = (position: 'first' | 'last' | 'active') => {
    requestAnimationFrame(() => {
      const options = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
      )
      if (options.length === 0) return
      if (position === 'last') {
        options.at(-1)?.focus()
        return
      }
      if (position === 'active') {
        const active = options.find(option => option.getAttribute('aria-selected') === 'true')
        const optionToFocus = active ?? options[0]
        optionToFocus.focus()
        return
      }
      options[0].focus()
    })
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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
  }

  return (
    <div className="w-[min(18rem,52vw)] min-w-0 shrink-0">
      <div ref={switcherRef} className="min-w-0">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Current project"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-busy={pendingProjectId !== null}
          disabled={projects.length === 0}
          onClick={() => {
            if (menuOpen) {
              setMenuOpen(false)
              setIsRenaming(false)
            } else {
              openMenu()
            }
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              openMenu()
              focusProjectOption(event.key === 'ArrowDown' ? 'active' : 'last')
            }
          }}
          className="group flex h-12 w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 text-left transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-green/10 text-accent-text">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6.5A2.5 2.5 0 016.5 4h4l2 2h5A2.5 2.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-11z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-text-tertiary">Project</span>
            <span className="block truncate text-sm font-semibold text-text-primary">{displayedProjectName}</span>
          </span>
          <svg className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
          </svg>
        </button>

        {menuOpen && menuPosition && createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            onKeyDown={handleMenuKeyDown}
            className="fixed z-popover overflow-hidden rounded-xl border border-border bg-surface shadow-lg motion-safe:animate-scale-in"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Projects</span>
              {mode === 'full' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setCreateOpen(true)
                  }}
                  className="-mr-1 rounded-md px-1.5 py-1 text-xs font-semibold text-accent-text outline-none transition-colors hover:bg-accent-green/10 focus-visible:ring-2 focus-visible:ring-accent-green"
                >
                  + Create project
                </button>
              )}
            </div>
            <div
              role="listbox"
              aria-label="Projects"
              className="max-h-64 overflow-y-auto overflow-x-hidden"
            >
              {projects.map(project => {
                const active = project.id === (pendingProjectId ?? projectId)
                return (
                  <div
                    key={project.id}
                    className={`group/project-row relative transition-colors ${active ? 'bg-accent-green/10' : 'hover:bg-surface-secondary focus-within:bg-surface-secondary'}`}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        if (active) return
                        setMenuActionError(null)
                        setPendingProjectId(project.id)
                        setMenuOpen(false)
                        setProjectActionsOpen(false)
                        setIsRenaming(false)
                        void loadProject(project.id)
                          .catch(cause => {
                            setPendingProjectId(null)
                            setMenuActionError(
                              cause instanceof Error ? cause.message : 'Could not switch projects',
                            )
                          })
                          .finally(() => {
                            setPendingProjectId(current => (
                              current === project.id ? null : current
                            ))
                          })
                      }}
                      className={`flex min-h-10 w-full min-w-0 items-center py-2 pl-3 pr-10 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-green ${active ? 'text-accent-text' : 'text-text-primary'}`}
                    >
                      <span className={`min-w-0 flex-1 truncate ${active ? 'font-semibold' : 'font-medium'}`}>
                        {project.name}
                      </span>
                    </button>
                    {mode === 'full' && (
                      <button
                        type="button"
                        aria-label={`Actions for ${project.name}`}
                        aria-haspopup="menu"
                        aria-expanded={projectActionsOpen && actionProjectId === project.id}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (projectActionsOpen && actionProjectId === project.id) {
                            setProjectActionsOpen(false)
                            return
                          }
                          const rect = event.currentTarget.getBoundingClientRect()
                          setActionProjectId(project.id)
                          setActionProjectName(project.name)
                          const actionMenuWidth = 176
                          const actionMenuHeight = 132
                          const gutter = 12
                          const outwardLeft = rect.right
                          const opensOutward = outwardLeft + actionMenuWidth <= window.innerWidth - gutter
                          const alignedLeft = opensOutward
                            ? outwardLeft
                            : Math.max(gutter, rect.left - actionMenuWidth)
                          setProjectActionsPosition({
                            left: alignedLeft,
                            top: Math.min(
                              Math.max(gutter, rect.top),
                              window.innerHeight - actionMenuHeight - gutter,
                            ),
                          })
                          setProjectActionsOpen(true)
                        }}
                        className={`absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md outline-none transition-[opacity,color] hover:text-text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-green group-hover/project-row:opacity-100 ${
                          projectActionsOpen && actionProjectId === project.id
                            ? 'text-text-primary opacity-100'
                            : 'text-text-tertiary opacity-0'
                        }`}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <circle cx="4" cy="10" r="1.25" />
                          <circle cx="10" cy="10" r="1.25" />
                          <circle cx="16" cy="10" r="1.25" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {mode === 'full' && projectActionsOpen && projectActionsPosition && createPortal(
              <div
                ref={actionMenuRef}
                role="menu"
                aria-label={`Actions for ${actionProjectName}`}
                style={projectActionsPosition}
                className="fixed z-popover w-44 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg motion-safe:animate-scale-in"
              >
                <button type="button" role="menuitem" onClick={() => {
                  void openRenameForProject().catch(cause => {
                    setMenuActionError(cause instanceof Error ? cause.message : 'Could not open rename')
                  })
                }} className="flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:text-text-tertiary" {...editBlocked}>
                  Rename
                </button>
                <button type="button" role="menuitem" onClick={() => {
                  void duplicateProjectFromActions().catch(cause => {
                    setMenuActionError(cause instanceof Error ? cause.message : 'Could not duplicate project')
                  })
                }} className="flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:text-text-tertiary" disabled={isDuplicating || isProjectOperationPending} {...editBlocked}>
                  {isDuplicating ? 'Duplicating…' : 'Duplicate'}
                </button>
                <button type="button" role="menuitem" onClick={() => {
                  setProjectActionsOpen(false)
                  setError(null)
                  setMenuOpen(false)
                  setDeleteOpen(true)
                }} className="flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:text-text-tertiary disabled:hover:bg-transparent" disabled={projects.length <= 1 || isProjectOperationPending} title={projects.length <= 1 ? 'The last project cannot be deleted' : undefined} {...editBlocked}>
                  Delete
                </button>
              </div>,
              document.body,
            )}
            {menuActionError && (
              <p className="border-t border-border-subtle px-3 py-2 text-xs text-error-text" role="alert">
                {menuActionError}
              </p>
            )}

            {mode === 'full' && isRenaming && (
              <ProjectSwitcherActions
                isRenaming={isRenaming}
                renameName={renameName}
                projectName={projectName}
                onRenameNameChange={setRenameName}
                onRenameStart={() => {
                  setRenameName(projectName)
                  setIsRenaming(true)
                }}
                onRenameCancel={() => setIsRenaming(false)}
                onRenameSubmit={handleRename}
              />
            )}
          </div>
          , document.body)}
      </div>

      {mode === 'full' && (
        <>
          <CreateProjectDialog
            open={createOpen}
            name={name}
            error={error}
            isCreating={isCreating}
            showCapacityFeedback={showCapacityFeedback}
            tier={user?.tier ?? 'guest'}
            onNameChange={setName}
            onSubmit={() => void handleCreate()}
            onSignIn={() => void handleSignIn()}
            onOpenChange={(open) => {
              if (isCreating) return
              setCreateOpen(open)
              if (!open) {
                setError(null)
                setShowCapacityFeedback(false)
                requestAnimationFrame(() => triggerRef.current?.focus())
              }
            }}
          />

          <DeleteProjectDialog
            open={deleteOpen}
            projectName={actionProjectName || projectName}
            error={error}
            isDeleting={isDeleting}
            onDelete={() => void handleDelete()}
            onOpenChange={(open) => {
              if (isDeleting) return
              setDeleteOpen(open)
              if (!open) {
                setError(null)
                requestAnimationFrame(() => triggerRef.current?.focus())
              }
            }}
          />
        </>
      )}
    </div>
  )
}
