import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useApp } from '@/state/AppContext'

export function ProjectSwitcher() {
  const {
    projectId,
    projectName,
    projects,
    isSaving,
    createNewProject,
    loadProject,
  } = useApp()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    const nextName = name.trim()
    if (!nextName) return
    setIsCreating(true)
    setError(null)
    try {
      await createNewProject(nextName)
      setName('')
      setCreateOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create project')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
      <label htmlFor="project-switcher" className="sr-only">Current project</label>
      <select
        id="project-switcher"
        value={projectId ?? ''}
        onChange={event => void loadProject(event.target.value)}
        disabled={isSaving || projects.length === 0}
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface-secondary px-2 py-2 text-xs font-medium text-text-primary"
        title={projectName}
      >
        {projects.length === 0 && <option value="">{projectName}</option>}
        {projects.map(project => (
          <option key={project.id} value={project.id}>{project.name}</option>
        ))}
      </select>

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="btn btn-secondary p-2"
            aria-label="New project"
            title="New project"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl">
            <Dialog.Title className="text-base font-semibold text-text-primary">
              Create project
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-text-secondary">
              Start a separate workspace. Pending changes in this project will be saved first.
            </Dialog.Description>
            <label htmlFor="new-project-name" className="mt-5 block text-xs font-medium text-text-primary">
              Project name
            </label>
            <input
              id="new-project-name"
              value={name}
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void handleCreate()
              }}
              className="mt-2 w-full rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary"
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost">Cancel</button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!name.trim() || isCreating}
                className="btn btn-primary"
              >
                {isCreating ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
