import { useCallback, useState } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useApp } from '@/state/AppContext'
import { ImportButton } from '@/components/ImportButton'
import { NewTableModal } from '@/canvas/modals/NewTableModal'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { ProjectNode, TableNode, ChartNode } from '@/lib/types'

interface SidebarProps {
  onOpenTable: (tableId: string) => void
  onOpenChart: (chartId: string) => void
  onOpenCanvas: () => void
  onOpenDashboard: () => void
  onOpenReport: () => void
}

export function Sidebar({ onOpenTable, onOpenChart, onOpenCanvas, onOpenDashboard, onOpenReport }: SidebarProps) {
  const nodes = useProjectStore((state) => state.nodes)
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const { deleteNodeWithSync } = useApp()
  
  const [newTableModalOpen, setNewTableModalOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const allNodes = Object.values(nodes) as ProjectNode[]
  const tableNodes = allNodes.filter(
    (node): node is TableNode => node.kind === 'source_table' || node.kind === 'derived_table'
  )

  const chartNodes = allNodes.filter(
    (node): node is ChartNode => node.kind === 'chart'
  )

  // Handle new table creation - opens modal for schema configuration
  const handleNewTable = useCallback(() => {
    setNewTableModalOpen(true)
  }, [])

  // Handle table click - navigate directly to table view
  const handleTableClick = useCallback((nodeId: string) => {
    onOpenTable(nodeId)
  }, [onOpenTable])

  // Handle chart click - navigate directly to chart view
  const handleChartClick = useCallback((chartId: string) => {
    onOpenChart(chartId)
  }, [onOpenChart])

  // Handle delete table
  const handleDeleteTable = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirmId(nodeId)
  }, [])

  // Confirm delete
  const confirmDelete = useCallback(async () => {
    if (deleteConfirmId) {
      await deleteNodeWithSync(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }, [deleteConfirmId, deleteNodeWithSync])

  // Cancel delete
  const cancelDelete = useCallback(() => {
    setDeleteConfirmId(null)
  }, [])

  return (
    <aside className="w-64 border-r border-border bg-surface flex flex-col">
      {/* Logo / Title */}
      <div className="h-14 border-b border-border flex items-center px-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#217346] flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="font-bold text-base text-text-primary">Table Canvas</span>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-2 border-b border-border">
        <ImportButton />
        <button
          onClick={handleNewTable}
          type="button"
          className="btn btn-secondary w-full gap-2 justify-center"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Table
        </button>
      </div>

      {/* Tables List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            Tables
          </div>
          <span className="text-xs font-medium text-text-tertiary bg-surface-secondary px-2 py-0.5 rounded-full">
            {tableNodes.length}
          </span>
        </div>
        {tableNodes.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-secondary flex items-center justify-center">
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
              <li key={node.id} className="group relative">
                <button
                  type="button"
                  onClick={() => handleTableClick(node.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                    selectedNodeId === node.id
                      ? 'bg-accent-green/10 text-accent-green shadow-sm'
                      : 'hover:bg-surface-secondary text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <TableIcon kind={node.kind} />
                    <span className="truncate flex-1 font-medium">{node.name}</span>
                    {/* Delete button - visible on hover */}
                    <button
                      onClick={(e) => handleDeleteTable(node.id, e)}
                      className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-text-tertiary hover:text-red-500 transition-all"
                      title="Delete table"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {node.schema && (
                    <div className="text-[11px] text-text-tertiary mt-1 ml-7">
                      {node.schema.rowCount || 0} rows · {node.schema.columns.length} cols
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Charts Section */}
        {chartNodes.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2 mt-6">
              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                Charts
              </div>
              <span className="text-xs font-medium text-text-tertiary bg-surface-secondary px-2 py-0.5 rounded-full">
                {chartNodes.length}
              </span>
            </div>
            <ul className="space-y-1">
              {chartNodes.map((node) => (
                <li key={node.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => handleChartClick(node.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                      selectedNodeId === node.id
                        ? 'bg-accent-green/10 text-accent-green shadow-sm'
                        : 'hover:bg-surface-secondary text-text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded bg-node-chart flex items-center justify-center text-node-chart-border">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
                        </svg>
                      </div>
                      <span className="truncate flex-1 font-medium">{node.name}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

      </div>

      {/* Quick Actions */}
      <div className="px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onOpenCanvas}
          className="btn btn-ghost w-full gap-2.5 justify-start text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          Canvas
        </button>
      </div>
      
      <div className="mx-4 border-t border-gray-200 dark:border-gray-700" />
      
      <div className="px-4 py-3 space-y-1">
        <button
          type="button"
          onClick={onOpenDashboard}
          className="btn btn-ghost w-full gap-2.5 justify-start text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Dashboard
        </button>
        <button
          type="button"
          onClick={onOpenReport}
          className="btn btn-ghost w-full gap-2.5 justify-start text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Report
        </button>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-surface-secondary/50">
        <ThemeToggle />
      </div>

      {/* New Table Modal */}
      <NewTableModal
        isOpen={newTableModalOpen}
        onClose={() => setNewTableModalOpen(false)}
      />

      {/* Delete Table Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl shadow-xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Delete Table</h3>
                <p className="text-sm text-text-secondary">
                  "{nodes[deleteConfirmId]?.name}"
                </p>
              </div>
            </div>
            <p className="text-sm text-text-secondary mb-6">
              Are you sure you want to delete this table? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={cancelDelete} className="btn btn-secondary">
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </aside>
  )
}

function TableIcon({ kind }: { kind: string }) {
  const isSource = kind === 'source_table'
  return (
    <div
      className={`w-4 h-4 rounded flex items-center justify-center ${
        isSource ? 'bg-node-source text-node-source-border' : 'bg-node-derived text-node-derived-border'
      }`}
    >
      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm2 0h14v4H5V5zm0 6h4v8H5v-8zm6 0h8v8h-8v-8z" />
      </svg>
    </div>
  )
}
