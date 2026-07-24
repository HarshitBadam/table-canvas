import { useState } from 'react'

interface Props {
  isRenaming: boolean
  renameName: string
  projectName: string
  isDuplicating: boolean
  isPending: boolean
  canDelete: boolean
  onRenameNameChange: (name: string) => void
  onRenameStart: () => void
  onRenameCancel: () => void
  onRenameSubmit: () => void
  onCreate: () => void
  onDuplicate: () => void
  onDelete: () => void
}

const actionClass = 'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-text-primary outline-none transition-colors hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-green active:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-50'

export function ProjectSwitcherActions(props: Props) {
  const [actionsOpen, setActionsOpen] = useState(false)

  if (props.isRenaming) {
    return (
      <form
        className="border-t border-border-subtle bg-surface-secondary/70 p-3"
        onSubmit={(event) => {
          event.preventDefault()
          props.onRenameSubmit()
        }}
      >
        <label htmlFor="rename-project-name" className="block text-xs font-medium text-text-secondary">
          Rename project
        </label>
        <div className="mt-2 flex items-center gap-1.5">
          <input
            id="rename-project-name"
            value={props.renameName}
            onChange={event => props.onRenameNameChange(event.target.value)}
            className="input h-9 min-w-0 flex-1 bg-surface px-2.5"
            autoFocus
            maxLength={100}
            onFocus={event => event.currentTarget.select()}
          />
          <button type="button" onClick={props.onRenameCancel} className="btn btn-ghost h-9 px-2.5">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!props.renameName.trim() || props.renameName.trim() === props.projectName}
            className="btn btn-primary h-9 px-2.5"
          >
            Save
          </button>
        </div>
      </form>
    )
  }

  return (
    <div
      role="menu"
      aria-label="Project actions"
      className="border-t border-border-subtle bg-surface-secondary/40 p-1.5"
    >
      <div className="flex gap-1">
        <button
          type="button"
          role="menuitem"
          disabled={props.isPending}
          onClick={props.onCreate}
          className={`${actionClass} flex-1 bg-accent-green/10 text-accent-text hover:bg-accent-green/15 active:bg-accent-green/20`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 5v14m7-7H5" />
          </svg>
          <span className="flex-1">New project</span>
        </button>
        <button
          type="button"
          role="menuitem"
          aria-expanded={actionsOpen}
          aria-label="More project actions"
          onClick={() => setActionsOpen(open => !open)}
          className="flex min-h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-tertiary outline-none transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-green"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <circle cx="4" cy="10" r="1.25" />
            <circle cx="10" cy="10" r="1.25" />
            <circle cx="16" cy="10" r="1.25" />
          </svg>
        </button>
      </div>
      {actionsOpen && (
        <div className="mt-1 border-t border-border-subtle pt-1">
          <button type="button" role="menuitem" disabled={props.isPending} onClick={props.onRenameStart} className={actionClass}>
            <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12.5 4.5l3 3M4 16l.75-3 8.5-8.5a1.4 1.4 0 012 2L6.75 15 4 16z" />
            </svg>
            <span className="flex-1">Rename current project</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={props.isDuplicating || props.isPending}
            onClick={props.onDuplicate}
            className={actionClass}
          >
            <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 8h11v11H8zM5 16H4V5h11v1" />
            </svg>
            <span className="flex-1">{props.isDuplicating ? 'Duplicating…' : 'Duplicate current project'}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!props.canDelete || props.isPending}
            title={!props.canDelete ? 'The last project cannot be deleted' : undefined}
            onClick={props.onDelete}
            className={`${actionClass} text-error-text hover:bg-error/10 focus-visible:ring-error active:bg-error/15`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
            </svg>
            <span className="flex-1">Delete current project</span>
          </button>
        </div>
      )}
    </div>
  )
}
