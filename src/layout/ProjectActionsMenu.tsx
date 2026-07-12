interface ProjectActionsMenuProps {
  onExport: () => void
  onImport: () => void
}

export function ProjectActionsMenu({
  onExport,
  onImport,
}: ProjectActionsMenuProps) {
  return (
    <div
      id="project-export-menu"
      role="menu"
      aria-label="Project actions"
      className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-50 py-1"
    >
      <button role="menuitem" tabIndex={-1} onClick={onExport} className="w-full px-4 py-2 text-left text-sm hover:bg-surface-secondary flex items-center gap-3">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <div>
          <div className="font-medium">Export Project</div>
          <div className="text-xs text-text-tertiary">ZIP with project file + Excel data</div>
        </div>
      </button>

      <div className="border-t border-border my-1" />

      <button role="menuitem" tabIndex={-1} onClick={onImport} className="w-full px-4 py-2 text-left text-sm hover:bg-surface-secondary flex items-center gap-3">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <div>
          <div className="font-medium">Import Project</div>
          <div className="text-xs text-text-tertiary">Load from .tablecanvas.json</div>
        </div>
      </button>

    </div>
  )
}
