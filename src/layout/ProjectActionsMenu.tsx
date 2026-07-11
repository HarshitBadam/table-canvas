interface ProjectActionsMenuProps {
  onExport: () => void
  onImport: () => void
  onDashboard: () => void
}

export function ProjectActionsMenu({
  onExport,
  onImport,
  onDashboard,
}: ProjectActionsMenuProps) {
  return (
    <div
      id="project-export-menu"
      role="menu"
      aria-label="Project actions"
      className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-50 py-1"
    >
      <button role="menuitem" tabIndex={-1} onClick={onExport} className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <div>
          <div className="font-medium">Export Project</div>
          <div className="text-xs text-text-tertiary">ZIP with project file + Excel data</div>
        </div>
      </button>

      <div className="border-t border-border my-1" />

      <button role="menuitem" tabIndex={-1} onClick={onImport} className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <div>
          <div className="font-medium">Import Project</div>
          <div className="text-xs text-text-tertiary">Load from .tablecanvas.json</div>
        </div>
      </button>

      <div className="border-t border-border my-1" />

      <button role="menuitem" tabIndex={-1} onClick={onDashboard} className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <div>
          <div className="font-medium">Dashboard</div>
          <div className="text-xs text-text-tertiary">View charts dashboard</div>
        </div>
      </button>
    </div>
  )
}
