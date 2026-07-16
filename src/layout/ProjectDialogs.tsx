import * as Dialog from '@radix-ui/react-dialog'
import type { Tier } from '@/shared/limits'

interface CreateProjectDialogProps {
  open: boolean
  name: string
  error: string | null
  isCreating: boolean
  showCapacityFeedback: boolean
  tier: Tier
  onNameChange: (name: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  onSignIn: () => void
}

export function CreateProjectDialog({
  open,
  name,
  error,
  isCreating,
  showCapacityFeedback,
  tier,
  onNameChange,
  onOpenChange,
  onSubmit,
  onSignIn,
}: CreateProjectDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-modal w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl motion-safe:animate-scale-in">
          <Dialog.Title className="text-base font-semibold text-text-primary">
            Create project
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-text-secondary">
            Start a separate workspace. Pending changes in this project will be saved first.
          </Dialog.Description>
          <form
            onSubmit={event => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <label htmlFor="new-project-name" className="mt-5 block text-xs font-medium text-text-primary">
              Project name
            </label>
            <input
              id="new-project-name"
              value={name}
              onChange={event => onNameChange(event.target.value)}
              className="input mt-2 bg-surface-secondary px-3 py-2"
              autoFocus
              maxLength={100}
              aria-describedby={error ? 'create-project-error' : undefined}
            />
            {error && (
              <div
                id="create-project-error"
                className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3"
                role="alert"
              >
                <p className="text-sm font-medium text-red-700">
                  {showCapacityFeedback
                    ? tier === 'guest'
                      ? 'Sign in to create more projects.'
                      : 'Project limit reached.'
                    : error}
                </p>
                {showCapacityFeedback && (
                  <p className="mt-1 text-xs text-text-secondary">{error}</p>
                )}
                {showCapacityFeedback && tier === 'guest' && (
                  <button type="button" onClick={onSignIn} className="btn btn-secondary mt-3">
                    Sign in with Google
                  </button>
                )}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" disabled={isCreating} className="btn btn-ghost">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!name.trim() || isCreating}
                className="btn btn-primary"
              >
                {isCreating ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface DeleteProjectDialogProps {
  open: boolean
  projectName: string
  error: string | null
  isDeleting: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
}

export function DeleteProjectDialog({
  open,
  projectName,
  error,
  isDeleting,
  onOpenChange,
  onDelete,
}: DeleteProjectDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-modal w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl motion-safe:animate-scale-in">
          <Dialog.Title className="text-base font-semibold text-text-primary">
            Delete “{projectName}”?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-secondary">
            This permanently removes the project and its reports from this device and your synced account. Shared source files are kept for other projects.
          </Dialog.Description>
          {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" disabled={isDeleting} className="btn btn-ghost">
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onDelete}
              className="btn bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? 'Deleting…' : 'Delete project'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
