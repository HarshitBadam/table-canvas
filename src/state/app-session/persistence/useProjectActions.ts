import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import {
  createProjectWithSync,
  deleteProjectWithSync,
  importProjectWithSync,
  loadProjectWithSync,
} from '@/persistence/sync/session/syncService'
import type { ProjectWithSync } from '@/persistence/sync/project/projectSync'
import {
  deleteReportsForProject,
  loadReportsForProject,
  saveAllReports,
} from '@/persistence/storage/local-db/reportStorage'
import { useReportStore } from '@/report/reportStore'
import {
  checkProjectCount,
  checkProjectTableLimits,
  type LimitExceeded,
} from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { useProjectStore } from '../../projectStore'
import type { AppProviderState, ProjectImportData } from '../appContextValue'
import { publishCatalogChanged } from '@/persistence/sync/project/projectCatalog'
import { getStorageScope, scopedStorageKey } from '@/persistence/storage/storageScope'
import {
  clearProjectActivity,
  hasUnexportedActivity,
  markProjectActive,
} from '@/layout/project-controls/projectActivity'
import { canDeleteDocument } from '../../document/documentLease'
import {
  cloneProjectContents,
  nextDuplicateName,
  ProjectActionError,
  toProjectActionError,
} from '../../project/projectOperations'

interface Options {
  state: AppProviderState
  setState: Dispatch<SetStateAction<AppProviderState>>
  tier: Tier
  flushProjectSave: () => Promise<void>
  prepareProject: (project: ProjectWithSync) => Promise<void>
  clearActiveWorkspace: () => Promise<void>
  setProjectLimitViolation: (violation: LimitExceeded | null) => void
}

export function useProjectActions({
  state,
  setState,
  tier,
  flushProjectSave,
  prepareProject,
  clearActiveWorkspace,
  setProjectLimitViolation,
}: Options) {
  const operationInFlight = useRef(false)
  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (operationInFlight.current) {
      throw new ProjectActionError('busy', 'Another project action is already in progress.')
    }
    operationInFlight.current = true
    setState(previous => ({ ...previous, isProjectOperationPending: true }))
    try {
      return await operation()
    } finally {
      operationInFlight.current = false
      setState(previous => ({ ...previous, isProjectOperationPending: false }))
    }
  }, [setState])

  const assertCapacity = useCallback(() => {
    const check = checkProjectCount(state.projects.length, tier)
    if (check.ok) return
    setProjectLimitViolation(check)
    throw new ProjectActionError('limit', check.reason)
  }, [setProjectLimitViolation, state.projects.length, tier])

  const activate = useCallback((project: ProjectWithSync) => {
    setState(previous => ({
      ...previous,
      projectId: project.id,
      projectName: project.name,
      projects: [{
        id: project.id,
        name: project.name,
        updatedAt: new Date(),
        createdAt: new Date(),
      }, ...previous.projects],
    }))
  }, [setState])

  const createNewProject = useCallback(async (name?: string) => run(async () => {
    assertCapacity()
    const source = useProjectStore.getState()
    const original: ProjectWithSync = {
      id: source.projectId,
      name: source.projectName,
      nodes: structuredClone(source.nodes),
      edges: structuredClone(source.edges),
      patches: structuredClone(source.patches),
    }
    await flushProjectSave()
    await useReportStore.getState().flushSaves()
    let createdId: string | undefined
    try {
      const project = await createProjectWithSync(name?.trim() || 'Untitled Project')
      createdId = project.id
      await prepareProject(project)
      activate(project)
      publishCatalogChanged()
    } catch (error) {
      if (createdId) {
        await deleteProjectWithSync(createdId).catch(() => undefined)
        await prepareProject(original).catch(() => undefined)
      }
      throw toProjectActionError(error, 'Could not create project')
    }
  }), [activate, assertCapacity, flushProjectSave, prepareProject, run])

  const loadProject = useCallback(async (projectId: string) => run(async () => {
    await flushProjectSave()
    await useReportStore.getState().flushSaves()
    try {
      const project = await loadProjectWithSync(projectId)
      if (!project) throw new ProjectActionError('not-found', 'Project not found')
      await prepareProject(project)
      setState(previous => ({
        ...previous,
        projectId: project.id,
        projectName: project.name,
      }))
    } catch (error) {
      throw toProjectActionError(error, 'Could not switch projects')
    }
  }), [flushProjectSave, prepareProject, run, setState])

  const duplicateActiveProject = useCallback(async () => run(async () => {
    assertCapacity()
    const source = useProjectStore.getState()
    if (!source.projectId) {
      throw new ProjectActionError('not-found', 'No active project to duplicate.')
    }
    await flushProjectSave()
    await useReportStore.getState().flushSaves()
    const reports = await loadReportsForProject(source.projectId)
    const clone = cloneProjectContents(
      source.nodes,
      source.edges,
      source.patches,
      reports,
      '',
    )
    const name = nextDuplicateName(source.projectName, state.projects.map(item => item.name))
    let duplicateId: string | undefined
    try {
      const duplicate = await importProjectWithSync({ ...clone, name })
      duplicateId = duplicate.id
      await saveAllReports(Object.fromEntries(
        Object.entries(clone.reports).map(([id, report]) => [
          id,
          { ...report, projectId: duplicate.id },
        ]),
      ))
      await prepareProject(duplicate)
      activate(duplicate)
      // Duplicate inherits unexported-work status from the source project.
      if (hasUnexportedActivity(getStorageScope(), [source.projectId])) {
        markProjectActive(getStorageScope(), duplicate.id)
      }
      publishCatalogChanged()
    } catch (error) {
      if (duplicateId) {
        await deleteReportsForProject(duplicateId).catch(() => undefined)
        await deleteProjectWithSync(duplicateId).catch(() => undefined)
        await prepareProject({
          id: source.projectId,
          name: source.projectName,
          nodes: source.nodes,
          edges: source.edges,
          patches: source.patches,
        }).catch(() => undefined)
      }
      throw toProjectActionError(error, 'Could not duplicate project')
    }
  }), [
    activate,
    assertCapacity,
    flushProjectSave,
    prepareProject,
    run,
    state.projects,
  ])

  const deleteProject = useCallback(async (projectId: string) => run(async () => {
    const index = state.projects.findIndex(project => project.id === projectId)
    if (index < 0) throw new ProjectActionError('not-found', 'Project not found.')
    const isActive = projectId === state.projectId
    try {
      const canDelete = await canDeleteDocument(
        scopedStorageKey(getStorageScope(), projectId),
        isActive,
      )
      if (!canDelete) {
        throw new ProjectActionError(
          'open-elsewhere',
          'This project is open in another tab and can’t be deleted right now.',
        )
      }
      if (isActive) {
        await flushProjectSave()
        await useReportStore.getState().flushSaves()
      }
      await deleteProjectWithSync(projectId)
      clearProjectActivity(getStorageScope(), projectId)
      if (isActive) await clearActiveWorkspace()
      setState(previous => ({
        ...previous,
        projectId: isActive ? null : previous.projectId,
        projectName: isActive ? 'Untitled Project' : previous.projectName,
        projects: previous.projects.filter(project => project.id !== projectId),
      }))
    } catch (error) {
      throw toProjectActionError(error, 'Could not delete project')
    }
  }), [
    clearActiveWorkspace,
    flushProjectSave,
    run,
    setState,
    state.projectId,
    state.projects,
  ])

  const importProject = useCallback(async (input: ProjectImportData) => run(async () => {
    assertCapacity()
    const limitsCheck = checkProjectTableLimits(input.nodes, tier, input.patches)
    if (!limitsCheck.ok) {
      setProjectLimitViolation(limitsCheck)
      throw new ProjectActionError('limit', limitsCheck.reason)
    }
    await flushProjectSave()
    await useReportStore.getState().flushSaves()
    let importedId: string | undefined
    try {
      const imported = await importProjectWithSync(input)
      importedId = imported.id
      if (input.reports?.length) {
        await saveAllReports(Object.fromEntries(input.reports.map(report => [
          report.id,
          { ...report, projectId: imported.id, schemaVersion: 1 },
        ])))
      }
      await prepareProject(imported)
      activate(imported)
      publishCatalogChanged()
    } catch (error) {
      if (importedId) {
        await deleteReportsForProject(importedId).catch(() => undefined)
        await deleteProjectWithSync(importedId).catch(() => undefined)
      }
      throw toProjectActionError(error, 'Could not import project')
    }
  }), [
    activate,
    assertCapacity,
    flushProjectSave,
    prepareProject,
    run,
    setProjectLimitViolation,
    tier,
  ])

  return {
    createNewProject,
    deleteProject,
    duplicateActiveProject,
    importProject,
    loadProject,
  }
}
