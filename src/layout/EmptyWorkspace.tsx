import { useState } from 'react'
import { useApp } from '@/state/AppContext'

export function EmptyWorkspace() {
  const {
    createNewProject,
    isProjectOperationPending,
    loadProject,
    projects,
  } = useApp()
  const [error, setError] = useState<string | null>(null)

  const run = async (operation: () => Promise<void>) => {
    setError(null)
    try {
      await operation()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The project action failed.')
    }
  }

  const nextProject = projects[0]
  return (
    <div className="flex h-full items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-green/10 text-accent-text">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6.5A2.5 2.5 0 016.5 4h4l2 2h5A2.5 2.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-11z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-text-primary">
          {nextProject ? 'Choose a project' : 'Create your first project'}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {nextProject
            ? 'Open an existing project or start a new workspace.'
            : 'Start with an empty workspace, then import or create a table.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {nextProject && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isProjectOperationPending}
              onClick={() => { void run(() => loadProject(nextProject.id)) }}
            >
              Open {nextProject.name}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={isProjectOperationPending}
            onClick={() => { void run(() => createNewProject('Untitled Project')) }}
          >
            {isProjectOperationPending ? 'Creating…' : 'Create project'}
          </button>
        </div>
        {error && (
          <p className="mt-4 text-sm text-error-text" role="alert">{error}</p>
        )}
      </div>
    </div>
  )
}
