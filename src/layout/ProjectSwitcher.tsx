import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '@/state/AppContext'
import { CreateProjectDialog, DeleteProjectDialog } from './ProjectDialogs'
import { ProjectSwitcherActions } from './ProjectSwitcherActions'
import { useNavigate } from 'react-router-dom'

interface MenuPosition {
  left: number
  top: number
  width: number
}

export function ProjectSwitcher() {
  const {
    projectId,
    projectName,
    projects,
    isSaving,
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
  const navigate = useNavigate()
  const switcherRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState('')
  const [renameName, setRenameName] = useState('')
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

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const gutter = 12
    const width = Math.min(288, window.innerWidth - gutter * 2)
    setMenuPosition({
      left: Math.min(Math.max(rect.left, gutter), window.innerWidth - width - gutter),
      top: rect.bottom + 6,
      width,
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
      ) {
        setMenuOpen(false)
        setIsRenaming(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isRenaming) {
          setIsRenaming(false)
          return
        }
        setMenuOpen(false)
        requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }
    const handleViewportChange = () => updateMenuPosition()

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
  }, [isRenaming, menuOpen, updateMenuPosition])

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
    if (!projectId || deleteLockRef.current) return
    deleteLockRef.current = true
    setIsDeleting(true)
    setError(null)
    try {
      await deleteProject(projectId)
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
      navigate('/login')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare sign-in')
    }
  }

  const handleRename = () => {
    const nextName = renameName.trim()
    if (!nextName || nextName === projectName) return
    renameProject(nextName)
    setIsRenaming(false)
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
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'),
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
    <div className="w-[min(14rem,48vw)] min-w-0 shrink-0">
      <div ref={switcherRef} className="min-w-0">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Current project"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          disabled={isSaving || isProjectOperationPending || projects.length === 0}
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
          className="group flex h-12 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-green/10 text-accent-text">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6.5A2.5 2.5 0 016.5 4h4l2 2h5A2.5 2.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-11z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-text-tertiary">Project</span>
            <span className="block truncate text-sm font-semibold text-text-primary">{projectName}</span>
          </span>
          <svg className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
          </svg>
        </button>

        {menuOpen && menuPosition && createPortal(
          <div
            ref={menuRef}
            style={menuPosition}
            className="fixed z-popover overflow-hidden rounded-lg border border-border bg-surface shadow-lg motion-safe:animate-scale-in"
          >
            <div className="px-3 pb-1.5 pt-3">
              <span className="text-xs font-semibold text-text-secondary">Projects</span>
            </div>
            <div
              role="listbox"
              aria-label="Projects"
              className="max-h-56 overflow-y-auto px-1.5 pb-1.5"
              onKeyDown={handleMenuKeyDown}
            >
              {projects.map(project => {
                const active = project.id === projectId
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      if (active) {
                        setMenuOpen(false)
                        setIsRenaming(false)
                        return
                      }
                      setMenuActionError(null)
                      void loadProject(project.id).then(() => {
                        setMenuOpen(false)
                        setIsRenaming(false)
                      }).catch(cause => {
                        setMenuActionError(
                          cause instanceof Error ? cause.message : 'Could not switch projects',
                        )
                      })
                    }}
                    className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'bg-accent-green/10 font-medium text-accent-text hover:bg-accent-green/15'
                        : 'text-text-primary hover:bg-surface-tertiary'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {active && (
                      <svg className="h-4 w-4 shrink-0 text-accent-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>

            {menuActionError && (
              <p className="border-t border-border-subtle px-3 py-2 text-xs text-red-700" role="alert">
                {menuActionError}
              </p>
            )}

            <ProjectSwitcherActions
              isRenaming={isRenaming}
              renameName={renameName}
              projectName={projectName}
              isDuplicating={isDuplicating}
              isPending={isProjectOperationPending}
              canDelete={projects.length > 1}
              onRenameNameChange={setRenameName}
              onRenameStart={() => {
                setRenameName(projectName)
                setIsRenaming(true)
              }}
              onRenameCancel={() => setIsRenaming(false)}
              onRenameSubmit={handleRename}
              onCreate={() => {
                setMenuOpen(false)
                setCreateOpen(true)
              }}
              onDuplicate={() => void handleDuplicate()}
              onDelete={() => {
                setError(null)
                setMenuOpen(false)
                setDeleteOpen(true)
              }}
            />
          </div>
          , document.body)}
      </div>

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
        projectName={projectName}
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
    </div>
  )
}
