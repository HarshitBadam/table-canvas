import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '@/state/AppContext'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/document/useWorkspaceLease'
import { checkProjectCount } from '@/shared/enforce'
import {
  CreateProjectDialog,
  DeleteProjectDialog,
  ProjectOpenElsewhereDialog,
} from './ProjectDialogs'
import { ProjectSwitcherMenu } from './ProjectSwitcherMenu'

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
  } = useApp()
  const switcherRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBlockedOpen, setDeleteBlockedOpen] = useState(false)
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
  const tier = user?.tier ?? 'guest'

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
    try {
      await createNewProject(nextName)
      setName('')
      setCreateOpen(false)
    } catch (cause) {
      const limitError =
        typeof cause === 'object' && cause !== null && 'code' in cause
          && cause.code === 'limit'
      if (limitError) {
        const capacity = checkProjectCount(projects.length, tier)
        setProjectLimitViolation(
          capacity.ok
            ? {
                ok: false,
                reason: cause instanceof Error ? cause.message : 'Project limit reached',
                limit: projects.length,
                tier,
              }
            : capacity,
        )
        setName('')
        setCreateOpen(false)
        return
      }
      setProjectLimitViolation(null)
      setError(cause instanceof Error ? cause.message : 'Could not create project')
    } finally {
      createLockRef.current = false
      setIsCreating(false)
    }
  }

  const handleDuplicate = async () => {
    if (duplicateLockRef.current) return
    const capacity = checkProjectCount(projects.length, tier)
    if (!capacity.ok) {
      setMenuOpen(false)
      setProjectActionsOpen(false)
      setProjectLimitViolation(capacity)
      return
    }
    duplicateLockRef.current = true
    setIsDuplicating(true)
    setMenuActionError(null)
    try {
      await duplicateActiveProject()
      setMenuOpen(false)
    } catch (cause) {
      const limitError =
        typeof cause === 'object' && cause !== null && 'code' in cause
          && cause.code === 'limit'
      if (limitError) {
        const updatedCapacity = checkProjectCount(projects.length, tier)
        setMenuOpen(false)
        setProjectActionsOpen(false)
        setProjectLimitViolation(
          updatedCapacity.ok
            ? {
                ok: false,
                reason: cause instanceof Error ? cause.message : 'Project limit reached',
                limit: projects.length,
                tier,
              }
            : updatedCapacity,
        )
        return
      }
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
      if (
        typeof cause === 'object'
        && cause !== null
        && 'code' in cause
        && cause.code === 'open-elsewhere'
      ) {
        setDeleteOpen(false)
        setDeleteBlockedOpen(true)
      } else {
        setError(cause instanceof Error ? cause.message : 'Could not delete project')
      }
    } finally {
      deleteLockRef.current = false
      setIsDeleting(false)
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

  const focusProjectOption = (position: 'last' | 'active') => {
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

  const selectProject = (nextProjectId: string) => {
    setMenuActionError(null)
    setPendingProjectId(nextProjectId)
    setMenuOpen(false)
    setProjectActionsOpen(false)
    setIsRenaming(false)
    void loadProject(nextProjectId)
      .catch(cause => {
        setPendingProjectId(null)
        setMenuActionError(
          cause instanceof Error ? cause.message : 'Could not switch projects',
        )
      })
      .finally(() => {
        setPendingProjectId(current => (
          current === nextProjectId ? null : current
        ))
      })
  }

  const toggleProjectActions = (
    project: { id: string; name: string },
    rect: DOMRect,
  ) => {
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
  }

  return (
    <div className="w-[min(10rem,32vw)] min-w-0 shrink-0 lg:w-[min(18rem,52vw)]">
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

        {menuOpen && menuPosition && (
          <ProjectSwitcherMenu
            mode={mode}
            menuRef={menuRef}
            actionMenuRef={actionMenuRef}
            menuPosition={menuPosition}
            projects={projects}
            projectId={projectId}
            projectName={projectName}
            pendingProjectId={pendingProjectId}
            tier={tier}
            canEditProps={editBlocked}
            isDuplicating={isDuplicating}
            isProjectOperationPending={isProjectOperationPending}
            projectActionsOpen={projectActionsOpen}
            projectActionsPosition={projectActionsPosition}
            actionProjectId={actionProjectId}
            actionProjectName={actionProjectName}
            isRenaming={isRenaming}
            renameName={renameName}
            menuActionError={menuActionError}
            onMenuKeyDown={handleMenuKeyDown}
            onSelectProject={selectProject}
            onToggleProjectActions={toggleProjectActions}
            onRenameFromActions={openRenameForProject}
            onDuplicateFromActions={duplicateProjectFromActions}
            onRenameNameChange={setRenameName}
            onRenameCancel={() => setIsRenaming(false)}
            onRenameSubmit={handleRename}
            setProjectLimitViolation={setProjectLimitViolation}
            setMenuOpen={setMenuOpen}
            setError={setError}
            setCreateOpen={setCreateOpen}
            setDeleteOpen={setDeleteOpen}
            setDeleteBlockedOpen={setDeleteBlockedOpen}
            setProjectActionsOpen={setProjectActionsOpen}
            setMenuActionError={setMenuActionError}
          />
        )}
      </div>

      {mode === 'full' && (
        <>
          <CreateProjectDialog
            open={createOpen}
            name={name}
            error={error}
            isCreating={isCreating}
            onNameChange={setName}
            onSubmit={() => void handleCreate()}
            onOpenChange={(open) => {
              if (isCreating) return
              setCreateOpen(open)
              if (!open) {
                setError(null)
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
          <ProjectOpenElsewhereDialog
            open={deleteBlockedOpen}
            onOpenChange={setDeleteBlockedOpen}
          />
        </>
      )}
    </div>
  )
}
