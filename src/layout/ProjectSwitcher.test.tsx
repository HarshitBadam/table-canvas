import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/state/appContextValue'
import { ProjectActionError } from '@/state/projectOperations'
import { ProjectSwitcher } from './ProjectSwitcher'

const actions = {
  createNewProject: vi.fn(),
  duplicateActiveProject: vi.fn(),
  deleteProject: vi.fn(),
  loadProject: vi.fn(),
  renameProject: vi.fn(),
  setProjectLimitViolation: vi.fn(),
}

function renderSwitcher(overrides: Partial<AppContextValue> = {}) {
  const value = {
    projectId: 'project-1',
    projectName: 'Quarterly plan',
    projects: [
      { id: 'project-1', name: 'Quarterly plan', createdAt: new Date(), updatedAt: new Date() },
      { id: 'project-2', name: 'Forecast', createdAt: new Date(), updatedAt: new Date() },
    ],
    isSaving: false,
    isProjectOperationPending: false,
    user: { tier: 'google' },
    ...actions,
    ...overrides,
  } as unknown as AppContextValue
  return render(
    <AppContext.Provider value={value}>
      <ProjectSwitcher />
    </AppContext.Provider>,
  )
}

function openCreateDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Current project' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'New project' }))
  return screen.getByRole('textbox', { name: 'Project name' })
}

function openProjectActions() {
  fireEvent.click(screen.getByRole('button', { name: 'Current project' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'More project actions' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.createNewProject.mockResolvedValue(undefined)
  actions.duplicateActiveProject.mockResolvedValue(undefined)
  actions.deleteProject.mockResolvedValue(undefined)
  actions.loadProject.mockResolvedValue(undefined)
})

describe('ProjectSwitcher project actions', () => {
  it('uses one form submission path for Enter and click', async () => {
    renderSwitcher()
    const input = openCreateDialog()
    fireEvent.change(input, { target: { value: 'Created by Enter' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(actions.createNewProject).toHaveBeenCalledOnce())
    expect(actions.createNewProject).toHaveBeenCalledWith('Created by Enter')

    openCreateDialog()
    const secondInput = screen.getByRole('textbox', { name: 'Project name' })
    fireEvent.change(secondInput, { target: { value: 'Created by click' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(actions.createNewProject).toHaveBeenCalledTimes(2))
    expect(actions.createNewProject).toHaveBeenLastCalledWith('Created by click')
  })

  it('locks rapid Enter submissions synchronously', async () => {
    let resolve!: () => void
    actions.createNewProject.mockReturnValue(new Promise<void>(done => { resolve = done }))
    renderSwitcher()
    const input = openCreateDialog()
    fireEvent.change(input, { target: { value: 'One project' } })

    fireEvent.submit(input.closest('form')!)
    fireEvent.submit(input.closest('form')!)

    expect(actions.createNewProject).toHaveBeenCalledOnce()
    resolve()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the name and dialog open when capacity rejects creation', async () => {
    actions.createNewProject.mockRejectedValue(
      new ProjectActionError('limit', 'You already have 3 projects (limit: 3)'),
    )
    renderSwitcher()
    const input = openCreateDialog()
    fireEvent.change(input, { target: { value: 'Keep this name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Project limit reached')
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Keep this name')
    expect(actions.setProjectLimitViolation).toHaveBeenCalledWith(null)
  })

  it('duplicates once and surfaces a retryable failure', async () => {
    actions.duplicateActiveProject.mockRejectedValueOnce(new Error('Sync unavailable'))
    renderSwitcher()
    openProjectActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate current project' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sync unavailable')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate current project' }))
    await waitFor(() => expect(actions.duplicateActiveProject).toHaveBeenCalledTimes(2))
  })

  it('names deletion consequences and keeps confirmation open on failure', async () => {
    actions.deleteProject.mockRejectedValueOnce(new Error('Delete failed'))
    renderSwitcher()
    openProjectActions()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete current project' }))

    expect(screen.getByRole('heading', { name: 'Delete “Quarterly plan”?' })).toBeVisible()
    expect(screen.getByText(/permanently removes the project and its reports/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete failed')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(actions.deleteProject).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('disables deletion for the last project', () => {
    renderSwitcher({
      projects: [
        { id: 'project-1', name: 'Quarterly plan', createdAt: new Date(), updatedAt: new Date() },
      ],
    })
    openProjectActions()
    expect(screen.getByRole('menuitem', { name: 'Delete current project' })).toBeDisabled()
  })
})
