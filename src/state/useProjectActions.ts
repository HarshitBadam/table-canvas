import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import {
  createProjectWithSync,
  deleteProjectWithSync,
  importProjectWithSync,
  loadProjectWithSync,
} from '@/persistence/syncService'
import type { ProjectWithSync } from '@/persistence/projectSync'
import {
  deleteReportsForProject,
  loadReportsForProject,
  saveAllReports,
} from '@/persistence/reportStorage'
import { useReportStore } from '@/report/reportStore'
import { checkProjectCount, type LimitExceeded } from '@/shared/enforce'
import type { Tier } from '@/shared/limits'
import { useProjectStore } from './projectStore'
import type { AppProviderState, ProjectImportData } from './appContextValue'
import {
  cloneProjectContents,
  nextDuplicateName,
  ProjectActionError,
  toProjectActionError,
} from './projectOperations'

interface Options {
  state: AppProviderState
  setState: Dispatch<SetStateAction<AppProviderState>>
  tier: Tier
  flushProjectSave: () => Promise<void>
  prepareProject: (project: ProjectWithSync) => Promise<void>
  setProjectLimitViolation: (violation: LimitExceeded | null) => void
}

export function useProjectActions({
  state,
  setState,
  tier,
  flushProjectSave,
  prepareProject,
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
    if (state.projects.length <= 1) {
      throw new ProjectActionError('last-project', 'The last project cannot be deleted.')
    }
    const index = state.projects.findIndex(project => project.id === projectId)
    if (index < 0) throw new ProjectActionError('not-found', 'Project not found.')
    const isActive = projectId === state.projectId
    const replacementSummary = isActive
      ? state.projects[index + 1] ?? state.projects[index - 1]
      : null
    const current = useProjectStore.getState()
    const original: ProjectWithSync = {
      id: current.projectId,
      name: current.projectName,
      nodes: structuredClone(current.nodes),
      edges: structuredClone(current.edges),
      patches: structuredClone(current.patches),
    }
    let deletedReports: Awaited<ReturnType<typeof loadReportsForProject>> = {}
    let replacementPrepared = false
    let reportsDeleted = false
    try {
      deletedReports = await loadReportsForProject(projectId)
      let replacement: ProjectWithSync | null = null
      if (replacementSummary) {
        await flushProjectSave()
        await useReportStore.getState().flushSaves()
        replacement = await loadProjectWithSync(replacementSummary.id)
        if (!replacement) {
          throw new ProjectActionError('not-found', 'The replacement project could not be loaded.')
        }
        await prepareProject(replacement)
        replacementPrepared = true
      }
      await deleteReportsForProject(projectId)
      reportsDeleted = true
      await deleteProjectWithSync(projectId)
      setState(previous => ({
        ...previous,
        projectId: replacement?.id ?? previous.projectId,
        projectName: replacement?.name ?? previous.projectName,
        projects: previous.projects.filter(project => project.id !== projectId),
      }))
    } catch (error) {
      const restorationFailures: unknown[] = []
      if (reportsDeleted) {
        await saveAllReports(deletedReports).catch(restoreError => {
          restorationFailures.push(restoreError)
        })
      }
      if (replacementPrepared) {
        await prepareProject(original).catch(restoreError => {
          restorationFailures.push(restoreError)
        })
      }
      if (restorationFailures.length > 0) {
        throw new ProjectActionError(
          'persistence',
          'Delete failed and the previous project could not be fully restored.',
          { failure: error, restorationFailures },
        )
      }
      throw toProjectActionError(error, 'Could not delete project')
    }
  }), [
    flushProjectSave,
    prepareProject,
    run,
    setState,
    state.projectId,
    state.projects,
  ])

  const importProject = useCallback(async (input: ProjectImportData) => run(async () => {
    assertCapacity()
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
    } catch (error) {
      if (importedId) {
        await deleteReportsForProject(importedId).catch(() => undefined)
        await deleteProjectWithSync(importedId).catch(() => undefined)
      }
      throw toProjectActionError(error, 'Could not import project')
    }
  }), [activate, assertCapacity, flushProjectSave, prepareProject, run])

  return {
    createNewProject,
    deleteProject,
    duplicateActiveProject,
    importProject,
    loadProject,
  }
}
