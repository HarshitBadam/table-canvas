import * as Dialog from '@radix-ui/react-dialog'

interface CreateProjectDialogProps {
  open: boolean
  name: string
  error: string | null
  isCreating: boolean
  onNameChange: (name: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}

export function CreateProjectDialog({
  open,
  name,
  error,
  isCreating,
  onNameChange,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/45 backdrop-blur-[2px] motion-safe:animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-modal m-auto h-fit w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 shadow-2xl motion-safe:animate-scale-in">
          <Dialog.Title className="text-lg font-semibold tracking-tight text-text-primary">
            Create a project
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-text-secondary">
            Start a separate workspace for another analysis. Your current work is saved first.
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
                className="mt-3 rounded-lg border border-error/20 bg-error/5 p-3"
                role="alert"
              >
                <p className="text-sm font-medium text-error-text">{error}</p>
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
        <Dialog.Content className="fixed inset-0 z-modal m-auto h-fit w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 shadow-2xl motion-safe:animate-scale-in">
          <Dialog.Title className="text-base font-semibold text-text-primary">
            Delete “{projectName}”?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-secondary">
            This permanently deletes the project and its reports. This action cannot be undone. Shared source files are kept for other projects.
          </Dialog.Description>
          {error && (
            <div className="mt-3 rounded-lg border border-error/20 bg-error/5 p-3" role="alert">
              <p className="text-sm font-medium text-error-text">Project wasn’t deleted</p>
              <p className="mt-1 text-xs text-text-secondary">{error}</p>
            </div>
          )}
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
              aria-busy={isDeleting}
              className="btn btn-danger"
            >
              {isDeleting ? 'Deleting…' : error ? 'Try again' : 'Delete project'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface ProjectOpenElsewhereDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProjectOpenElsewhereDialog({
  open,
  onOpenChange,
}: ProjectOpenElsewhereDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-modal m-auto h-fit w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 shadow-2xl motion-safe:animate-scale-in">
          <Dialog.Title className="text-base font-semibold text-text-primary">
            Project is open elsewhere
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-secondary">
            This project is open in another tab and can’t be deleted right now.
          </Dialog.Description>
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-primary">OK</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface GuestSignInDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onContinue: () => void
}

export function GuestSignInDialog({
  open,
  onOpenChange,
  onContinue,
}: GuestSignInDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-backdrop bg-black/40 motion-safe:animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-modal m-auto h-fit w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 shadow-2xl motion-safe:animate-scale-in">
          <Dialog.Title className="text-base font-semibold text-text-primary">
            Sign in without guest projects?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-text-secondary">
            Guest projects will not carry into your account. Export anything you want to keep, then import it after signing in.
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-ghost">Cancel</button>
            </Dialog.Close>
            <button type="button" onClick={onContinue} className="btn btn-danger">
              Continue to sign in
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
