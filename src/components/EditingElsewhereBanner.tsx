import { useWorkspaceLease } from '@/state/useWorkspaceLease'

/**
 * Compact document status for the header. Read-only is normal coordination state,
 * not a page-level warning, so this component never shifts the workspace.
 */
export function EditingElsewhereBanner() {
  const { role } = useWorkspaceLease()
  if (role !== 'mirror') return null

  return (
    <div
      className="flex min-w-0 shrink items-center rounded-md bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
      role="status"
      aria-live="off"
      title="Another tab is editing this project."
    >
      <span className="hidden max-w-56 truncate md:inline">Read-only · Editing in another tab</span>
      <span className="md:hidden">Read-only</span>
    </div>
  )
}
