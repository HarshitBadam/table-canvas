/**
 * Every view the workspace can show. `canvas`, `dashboard` and `report` own the
 * whole screen; `grid` and `chart` are pointed at a single node, so they can
 * only be shown while that node exists.
 */
const VIEW_MODES = ['canvas', 'grid', 'chart', 'dashboard', 'report'] as const

export type ViewMode = typeof VIEW_MODES[number]

/** Guards a view read back from storage, which may predate this build. */
export function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value)
}

/**
 * Node rows represent node-scoped destinations only. A canvas graph selection
 * must not compete with Canvas, Dashboard, or Report in the sidebar.
 */
export function activeSidebarNodeId(
  view: ViewMode,
  selectedNodeId: string | null,
): string | null {
  return view === 'grid' || view === 'chart' ? selectedNodeId : null
}

export const WORKSPACE_NAV_ITEMS = [
  {
    id: 'canvas',
    label: 'Canvas',
    iconPath: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    id: 'report',
    label: 'Report',
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
] as const

export type WorkspaceNavId = typeof WORKSPACE_NAV_ITEMS[number]['id']
