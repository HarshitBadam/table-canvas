import { useCallback, useState } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { ImportButton } from '@/components/ImportButton'
import { useNodeDeletion } from '@/components/nodeDeletionContext'
import { NewTableModal } from '@/canvas/modals/NewTableModal'
import { ThemeToggle } from '@/components/ThemeToggle'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/useWorkspaceLease'
import { useNavigation } from './NavigationContext'
import { activeSidebarNodeId, WORKSPACE_NAV_ITEMS, type ViewMode } from './viewNavigation'
import type { ProjectNode, TableNode, ChartNode } from '@/types'
import { useDialogFocus } from '@/components/useDialogFocus'
import { BrandMark } from '@/components/BrandMark'
import { SidebarNodeItem } from './SidebarNodeItem'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  activeView?: ViewMode
}

export function Sidebar({
  isOpen = false,
  onClose = () => undefined,
  activeView = 'canvas',
}: SidebarProps) {
  const { openTable, openChart, openCanvas, openDashboard, openReport } = useNavigation()
  const nodes = useProjectStore((state) => state.nodes)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const { requestNodeDeletion } = useNodeDeletion()
  const { canEdit } = useWorkspaceLease()
  const [newTableModalOpen, setNewTableModalOpen] = useState(false)

  const activeNodeId = activeSidebarNodeId(activeView, selectedNodeId)

  const allNodes = Object.values(nodes) as ProjectNode[]
  const tableNodes = allNodes.filter(
    (node): node is TableNode => node.kind === 'source_table' || node.kind === 'derived_table'
  )

  const chartNodes = allNodes.filter(
    (node): node is ChartNode => node.kind === 'chart'
  )
  const handleNewTable = useCallback(() => {
    setNewTableModalOpen(true)
    onClose()
  }, [onClose])

  const handleTableClick = useCallback((nodeId: string) => {
    openTable(nodeId)
    onClose()
  }, [onClose, openTable])

  const handleChartClick = useCallback((chartId: string) => {
    openChart(chartId)
    onClose()
  }, [onClose, openChart])

  const handleDeleteNode = useCallback((nodeId: string, returnFocus?: HTMLElement | null) => {
    requestNodeDeletion(nodeId, returnFocus)
  }, [requestNodeDeletion])
  const drawerDialogRef = useDialogFocus<HTMLElement>(isOpen, onClose)

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-modal-backdrop bg-black/40 lg:hidden"
        />
      )}
      <aside
        ref={drawerDialogRef}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-label="Primary navigation"
        className={`safe-area-top fixed inset-y-0 left-0 z-modal flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r border-border bg-surface shadow-lg transition-transform duration-200 lg:visible lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:shadow-none lg:transition-none ${
          isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b border-border px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="w-9 h-9 rounded bg-accent-green flex items-center justify-center">
              <BrandMark className="w-5 h-5 text-white" />
            </div>
            <span className="truncate font-bold text-base text-text-primary">Table Canvas</span>
          </div>
        </div>

        <div className="space-y-2 border-b border-border p-4">
          <ImportButton />
          <button
            onClick={handleNewTable}
            type="button"
            disabled={!canEdit}
            title={canEdit ? undefined : EDITING_ELSEWHERE_TOOLTIP}
            className="btn btn-secondary w-full gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Table
          </button>
        </div>

        <div className="scrollbar-hide flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Tables
          </h2>
          <span className="text-xs tabular-nums text-text-tertiary">
            {tableNodes.length} {tableNodes.length === 1 ? 'table' : 'tables'}
          </span>
        </div>
        {tableNodes.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded bg-surface-secondary flex items-center justify-center">
              <svg className="w-6 h-6 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-text-secondary font-medium mb-1">No tables yet</p>
            <p className="text-xs text-text-tertiary">Import a file or create a new table to get started.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {tableNodes.map((node) => (
              <SidebarNodeItem
                key={node.id}
                node={node}
                selected={activeNodeId === node.id}
                onOpen={handleTableClick}
                onDelete={handleDeleteNode}
              />
            ))}
          </ul>
        )}

        {chartNodes.length > 0 && (
          <>
            <div className="mb-3 mt-6 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Charts
              </h2>
              <span className="text-xs tabular-nums text-text-tertiary">
                {chartNodes.length} {chartNodes.length === 1 ? 'chart' : 'charts'}
              </span>
            </div>
            <ul className="space-y-1">
              {chartNodes.map((node) => (
                <SidebarNodeItem
                  key={node.id}
                  node={node}
                  selected={activeNodeId === node.id}
                  onOpen={handleChartClick}
                  onDelete={handleDeleteNode}
                />
              ))}
            </ul>
          </>
        )}

      </div>

        <nav className="space-y-1 border-t border-border px-4 py-3" aria-label="Views">
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const openView = item.id === 'canvas'
              ? openCanvas
              : item.id === 'dashboard'
                ? openDashboard
                : openReport
            const isActive = activeView === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { openView(); onClose() }}
                aria-current={isActive ? 'page' : undefined}
                className={`btn btn-ghost w-full gap-2.5 justify-start text-sm ${
                  isActive ? 'sidebar-view-active' : ''
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.iconPath} />
                </svg>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-border bg-surface-secondary/50 p-4">
          <ThemeToggle />
        </div>

        <NewTableModal
        isOpen={newTableModalOpen}
        onClose={() => setNewTableModalOpen(false)}
      />

      </aside>
    </>
  )
}
