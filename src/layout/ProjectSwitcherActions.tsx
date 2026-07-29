interface Props {
  isRenaming: boolean
  renameName: string
  projectName: string
  onRenameNameChange: (name: string) => void
  onRenameStart: () => void
  onRenameCancel: () => void
  onRenameSubmit: () => void
}

export function ProjectSwitcherActions(props: Props) {
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

  return null
}
