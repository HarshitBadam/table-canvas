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

const actionClass = 'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60'

export function ProjectSwitcherActions(props: Props) {
  if (props.isRenaming) {
    return (
      <form
        className="bg-surface-secondary/70 p-3"
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
    <div className="grid grid-cols-2 gap-1 bg-surface-secondary/70 p-1.5">
      <button type="button" onClick={props.onRenameStart} className={actionClass}>
        <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12.5 4.5l3 3M4 16l.75-3 8.5-8.5a1.4 1.4 0 012 2L6.75 15 4 16z" />
        </svg>
        Rename
      </button>
      <button type="button" onClick={props.onCreate} className={actionClass}>
        <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 5v14m7-7H5" />
        </svg>
        New project
      </button>
      <button
        type="button"
        disabled={props.isDuplicating || props.isPending}
        onClick={props.onDuplicate}
        className={actionClass}
      >
        <svg className="h-4 w-4 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 8h11v11H8zM5 16H4V5h11v1" />
        </svg>
        {props.isDuplicating ? 'Duplicating…' : 'Duplicate'}
      </button>
      <button
        type="button"
        disabled={!props.canDelete || props.isPending}
        title={!props.canDelete ? 'The last project cannot be deleted' : undefined}
        onClick={props.onDelete}
        className={`${actionClass} text-red-700 hover:bg-red-500/10`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
        </svg>
        Delete
      </button>
    </div>
  )
}
