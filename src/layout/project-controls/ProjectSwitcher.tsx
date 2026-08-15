import { useApp } from '@/state/AppContext'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/document/useWorkspaceLease'
import {
  CreateProjectDialog,
  DeleteProjectDialog,
  ProjectOpenElsewhereDialog,
} from './ProjectDialogs'
import { ProjectSwitcherMenu } from './ProjectSwitcherMenu'
import { useProjectSwitcherMenu } from './useProjectSwitcherMenu'
import { useProjectSwitcherOperations } from './useProjectSwitcherOperations'

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
  const { canEdit } = useWorkspaceLease()
  const tier = user?.tier ?? 'guest'
  const editBlocked = canEdit ? {} : { disabled: true, title: EDITING_ELSEWHERE_TOOLTIP }

  const menu = useProjectSwitcherMenu()
  const ops = useProjectSwitcherOperations({
    projectId,
    projects,
    tier,
    actionProjectId: menu.actionProjectId,
    actionProjectName: menu.actionProjectName,
    setIsRenaming: menu.setIsRenaming,
    setMenuOpen: menu.setMenuOpen,
    setProjectActionsOpen: menu.setProjectActionsOpen,
    focusTrigger: menu.focusTrigger,
    createNewProject,
    duplicateActiveProject,
    deleteProject,
    loadProject,
    renameProject,
    setProjectLimitViolation,
  })

  const pendingProject = projects.find(project => project.id === ops.pendingProjectId)
  const displayedProjectName = pendingProject?.name ?? projectName

  return (
    <div className="w-[min(10rem,32vw)] min-w-0 shrink-0 lg:w-[min(18rem,52vw)]">
      <div ref={menu.switcherRef} className="min-w-0">
        <button
          ref={menu.triggerRef}
          type="button"
          aria-label="Current project"
          aria-haspopup="listbox"
          aria-expanded={menu.menuOpen}
          aria-busy={ops.pendingProjectId !== null}
          disabled={projects.length === 0}
          onClick={menu.toggleMenu}
          onKeyDown={menu.handleTriggerKeyDown}
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
          <svg className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-150 ${menu.menuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
          </svg>
        </button>

        {menu.menuOpen && menu.menuPosition && (
          <ProjectSwitcherMenu
            mode={mode}
            menuRef={menu.menuRef}
            actionMenuRef={menu.actionMenuRef}
            menuPosition={menu.menuPosition}
            projects={projects}
            projectId={projectId}
            projectName={projectName}
            pendingProjectId={ops.pendingProjectId}
            tier={tier}
            canEditProps={editBlocked}
            isDuplicating={ops.isDuplicating}
            isProjectOperationPending={isProjectOperationPending}
            projectActionsOpen={menu.projectActionsOpen}
            projectActionsPosition={menu.projectActionsPosition}
            actionProjectId={menu.actionProjectId}
            actionProjectName={menu.actionProjectName}
            isRenaming={menu.isRenaming}
            renameName={ops.renameName}
            menuActionError={ops.menuActionError}
            onMenuKeyDown={menu.handleMenuKeyDown}
            onSelectProject={ops.selectProject}
            onToggleProjectActions={menu.toggleProjectActions}
            onRenameFromActions={ops.openRenameForProject}
            onDuplicateFromActions={ops.duplicateProjectFromActions}
            onRenameNameChange={ops.setRenameName}
            onRenameCancel={() => menu.setIsRenaming(false)}
            onRenameSubmit={ops.handleRename}
            setProjectLimitViolation={setProjectLimitViolation}
            setMenuOpen={menu.setMenuOpen}
            setError={ops.setError}
            setCreateOpen={ops.setCreateOpen}
            setDeleteOpen={ops.setDeleteOpen}
            setDeleteBlockedOpen={ops.setDeleteBlockedOpen}
            setProjectActionsOpen={menu.setProjectActionsOpen}
            setMenuActionError={ops.setMenuActionError}
          />
        )}
      </div>

      {mode === 'full' && (
        <>
          <CreateProjectDialog
            open={ops.createOpen}
            name={ops.name}
            error={ops.error}
            isCreating={ops.isCreating}
            onNameChange={ops.setName}
            onSubmit={() => void ops.handleCreate()}
            onOpenChange={(open) => {
              if (ops.isCreating) return
              ops.setCreateOpen(open)
              if (!open) {
                ops.setError(null)
                menu.focusTrigger()
              }
            }}
          />

          <DeleteProjectDialog
            open={ops.deleteOpen}
            projectName={menu.actionProjectName || projectName}
            error={ops.error}
            isDeleting={ops.isDeleting}
            onDelete={() => void ops.handleDelete()}
            onOpenChange={(open) => {
              if (ops.isDeleting) return
              ops.setDeleteOpen(open)
              if (!open) {
                ops.setError(null)
                menu.focusTrigger()
              }
            }}
          />
          <ProjectOpenElsewhereDialog
            open={ops.deleteBlockedOpen}
            onOpenChange={ops.setDeleteBlockedOpen}
          />
        </>
      )}
    </div>
  )
}
