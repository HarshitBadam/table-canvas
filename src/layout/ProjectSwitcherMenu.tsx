import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { checkProjectCount } from '@/shared/enforce'
import type { LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { canDeleteDocument } from '@/state/documentLease'
import { getStorageScope, scopedStorageKey } from '@/persistence/storageScope'
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

interface ProjectSummary {
  id: string
  name: string
}

interface Props {
  mode: 'full' | 'switch-only'
  menuRef: RefObject<HTMLDivElement>
  actionMenuRef: RefObject<HTMLDivElement>
  menuPosition: MenuPosition
  projects: ProjectSummary[]
  projectId: string | null
  projectName: string
  pendingProjectId: string | null
  tier: Tier
  canEditProps: { disabled?: boolean; title?: string }
  isDuplicating: boolean
  isProjectOperationPending: boolean
  projectActionsOpen: boolean
  projectActionsPosition: ActionMenuPosition | null
  actionProjectId: string | null
  actionProjectName: string
  isRenaming: boolean
  renameName: string
  menuActionError: string | null
  onMenuKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onSelectProject: (projectId: string) => void
  onToggleProjectActions: (
    project: ProjectSummary,
    anchor: DOMRect,
  ) => void
  onRenameFromActions: () => void | Promise<void>
  onDuplicateFromActions: () => void | Promise<void>
  onRenameNameChange: (name: string) => void
  onRenameCancel: () => void
  onRenameSubmit: () => void
  setProjectLimitViolation: (violation: LimitExceeded | null) => void
  setMenuOpen: (open: boolean) => void
  setError: (error: string | null) => void
  setCreateOpen: (open: boolean) => void
  setDeleteOpen: (open: boolean) => void
  setDeleteBlockedOpen: (open: boolean) => void
  setProjectActionsOpen: (open: boolean) => void
  setMenuActionError: (error: string | null) => void
}

export function ProjectSwitcherMenu({
  mode,
  menuRef,
  actionMenuRef,
  menuPosition,
  projects,
  projectId,
  projectName,
  pendingProjectId,
  tier,
  canEditProps,
  isDuplicating,
  isProjectOperationPending,
  projectActionsOpen,
  projectActionsPosition,
  actionProjectId,
  actionProjectName,
  isRenaming,
  renameName,
  menuActionError,
  onMenuKeyDown,
  onSelectProject,
  onToggleProjectActions,
  onRenameFromActions,
  onDuplicateFromActions,
  onRenameNameChange,
  onRenameCancel,
  onRenameSubmit,
  setProjectLimitViolation,
  setMenuOpen,
  setError,
  setCreateOpen,
  setDeleteOpen,
  setDeleteBlockedOpen,
  setProjectActionsOpen,
  setMenuActionError,
}: Props) {
  return createPortal(
    <div
      ref={menuRef}
      style={menuPosition}
      onKeyDown={onMenuKeyDown}
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
              const capacity = checkProjectCount(projects.length, tier)
              if (!capacity.ok) {
                setProjectLimitViolation(capacity)
                return
              }
              setError(null)
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
                  onSelectProject(project.id)
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
                    onToggleProjectActions(project, event.currentTarget.getBoundingClientRect())
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void Promise.resolve(onRenameFromActions()).catch(cause => {
                setMenuActionError(cause instanceof Error ? cause.message : 'Could not open rename')
              })
            }}
            className="flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:text-text-tertiary"
            {...canEditProps}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void Promise.resolve(onDuplicateFromActions()).catch(cause => {
                setMenuActionError(cause instanceof Error ? cause.message : 'Could not duplicate project')
              })
            }}
            className="flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:text-text-tertiary"
            disabled={isDuplicating || isProjectOperationPending}
            {...canEditProps}
          >
            {isDuplicating ? 'Duplicating…' : 'Duplicate'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setProjectActionsOpen(false)
              setError(null)
              setMenuOpen(false)
              const targetId = actionProjectId
              if (!targetId) return
              void canDeleteDocument(
                scopedStorageKey(getStorageScope(), targetId),
                targetId === projectId,
              ).then(allowed => {
                if (allowed) setDeleteOpen(true)
                else setDeleteBlockedOpen(true)
              })
            }}
            className="flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm text-text-primary transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:text-text-tertiary disabled:hover:bg-transparent"
            disabled={isProjectOperationPending}
          >
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
          renameName={renameName}
          projectName={projectName}
          onRenameNameChange={onRenameNameChange}
          onRenameCancel={onRenameCancel}
          onRenameSubmit={onRenameSubmit}
        />
      )}
    </div>,
    document.body,
  )
}
