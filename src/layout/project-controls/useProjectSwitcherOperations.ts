import { useRef, useState } from 'react'
import { checkProjectCount } from '@/shared/enforce'
import type { LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'

interface ProjectSummary {
  id: string
  name: string
}

interface Options {
  projectId: string | null
  projects: ProjectSummary[]
  tier: Tier
  actionProjectId: string | null
  actionProjectName: string
  setIsRenaming: (renaming: boolean) => void
  setMenuOpen: (open: boolean) => void
  setProjectActionsOpen: (open: boolean) => void
  focusTrigger: () => void
  createNewProject: (name: string) => Promise<void>
  duplicateActiveProject: () => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
  loadProject: (projectId: string) => Promise<void>
  renameProject: (name: string) => void
  setProjectLimitViolation: (violation: LimitExceeded | null) => void
}

/**
 * Owns project create/duplicate/delete/rename/switch orchestration: dialog
 * and inline-form field state, per-action loading flags, synchronous
 * re-entrancy locks, and mapping thrown errors to either the global project
 * limit notice or a local error surface. Menu/popover open state lives in
 * useProjectSwitcherMenu and is threaded in as setters so both flows can
 * close each other's UI without importing one another.
 */
export function useProjectSwitcherOperations({
  projectId,
  projects,
  tier,
  actionProjectId,
  actionProjectName,
  setIsRenaming,
  setMenuOpen,
  setProjectActionsOpen,
  focusTrigger,
  createNewProject,
  duplicateActiveProject,
  deleteProject,
  loadProject,
  renameProject,
  setProjectLimitViolation,
}: Options) {
  const [name, setName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [menuActionError, setMenuActionError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBlockedOpen, setDeleteBlockedOpen] = useState(false)
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const createLockRef = useRef(false)
  const duplicateLockRef = useRef(false)
  const deleteLockRef = useRef(false)

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
      focusTrigger()
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

  return {
    name,
    setName,
    renameName,
    setRenameName,
    error,
    setError,
    isCreating,
    isDuplicating,
    isDeleting,
    menuActionError,
    setMenuActionError,
    createOpen,
    setCreateOpen,
    deleteOpen,
    setDeleteOpen,
    deleteBlockedOpen,
    setDeleteBlockedOpen,
    pendingProjectId,
    handleCreate,
    handleDuplicate,
    handleDelete,
    handleRename,
    openRenameForProject,
    duplicateProjectFromActions,
    selectProject,
  }
}
