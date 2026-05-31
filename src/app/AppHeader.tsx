import { useCallback } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useReportStore } from '@/report/reportStore'
import { useApp, useAppAuth } from '@/state/AppContext'
import { exportReportToPDF } from '@/report/pdfExport'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useNavigation } from './NavigationContext'
import type { ChartNode, ProjectNode } from '@/types'
import type { ViewMode } from './App'
import type { ProjectExportState } from './useProjectExport'

interface AppHeaderProps {
  viewMode: ViewMode
  selectedNode: ProjectNode | null
  exportState: ProjectExportState
  onBackToCanvas: () => void
  onOpenDashboard: () => void
}

export function AppHeader({
  viewMode,
  selectedNode,
  exportState,
  onBackToCanvas,
  onOpenDashboard,
}: AppHeaderProps) {
  const { user, logout } = useAppAuth()
  const { isSaving } = useApp()

  const {
    isExporting,
    isImporting,
    exportProgress,
    exportError,
    exportDropdownOpen,
    dropdownRef,
    importInputRef,
    handleExport,
    handleImportClick,
    handleImportFile,
    setExportDropdownOpen,
  } = exportState

  const handleExportPDF = useCallback(() => {
    const reportContent = document.querySelector('.report-view .tiptap-editor-content')
    const currentReportId = useReportStore.getState().selectedReportId
    const report = currentReportId ? useReportStore.getState().reports[currentReportId] : null
    if (reportContent) {
      exportReportToPDF(reportContent as HTMLElement, {
        reportName: report?.name || 'Report',
      })
    }
  }, [])

  return (
    <header className="h-12 border-b border-border bg-surface flex items-center px-4 gap-4">
      {viewMode === 'grid' && selectedNode && (
        <GridHeaderContent
          selectedNode={selectedNode}
          onBackToCanvas={onBackToCanvas}
        />
      )}
      {viewMode === 'chart' && selectedNode && (
        <ChartHeaderContent
          selectedNode={selectedNode}
          onBackToCanvas={onBackToCanvas}
        />
      )}
      {viewMode === 'dashboard' && (
        <SimpleHeaderContent label="Dashboard" onBackToCanvas={onBackToCanvas} />
      )}
      {viewMode === 'report' && (
        <>
          <BackToCanvasButton onClick={onBackToCanvas} />
          <div className="h-6 w-px bg-border" />
          <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium">Report</span>
          <div className="flex-1" />
          <button onClick={handleExportPDF} className="btn btn-secondary gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </button>
        </>
      )}
      {viewMode === 'canvas' && (
        <>
          <span className="text-sm font-medium text-text-secondary">Table Canvas</span>
          <div className="flex-1" />

          {exportError && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-600 rounded-md text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {exportError}
            </div>
          )}

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              disabled={isExporting || isImporting}
              className="btn btn-secondary gap-2"
            >
              {(isExporting || isImporting) ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="truncate max-w-32">
                    {isExporting ? (exportProgress || 'Exporting...') : 'Importing...'}
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Export
                  <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>

            {exportDropdownOpen && (
              <ExportDropdownMenu
                onExport={handleExport}
                onImport={handleImportClick}
                onDashboard={() => { setExportDropdownOpen(false); onOpenDashboard() }}
              />
            )}
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept=".json,.tablecanvas.json"
            onChange={handleImportFile}
            className="hidden"
          />
        </>
      )}

      {isSaving && (
        <div className="flex items-center gap-1.5 text-text-tertiary">
          <LoadingSpinner size="sm" className="w-3 h-3" />
          <span className="text-xs">Saving...</span>
        </div>
      )}

      <div className="h-6 w-px bg-border ml-2" />
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">{user?.name || user?.email}</span>
        {user?.id !== 'local-user' && (
          <button onClick={logout} className="btn btn-ghost text-xs px-2 py-1" title="Sign out">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        )}
      </div>
    </header>
  )
}

function BackToCanvasButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn btn-ghost gap-2">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Canvas
    </button>
  )
}

function GridHeaderContent({ selectedNode, onBackToCanvas }: { selectedNode: ProjectNode; onBackToCanvas: () => void }) {
  return (
    <>
      <BackToCanvasButton onClick={onBackToCanvas} />
      <div className="h-6 w-px bg-border" />
      <span className="text-sm font-medium">{selectedNode.name}</span>
      <span className="badge badge-blue">
        {selectedNode.kind === 'source_table' ? 'Source - Editable' : 'Derived - View Only'}
      </span>
      {selectedNode.kind === 'source_table' && (
        <span className="text-xs text-text-tertiary ml-2">
          Double-click a cell or press Enter to edit
        </span>
      )}
      <div className="flex-1" />
    </>
  )
}

function ChartHeaderContent({
  selectedNode,
  onBackToCanvas,
}: {
  selectedNode: ProjectNode
  onBackToCanvas: () => void
}) {
  const { openTable } = useNavigation()
  const chartNode = selectedNode as ChartNode
  const sourceTableName = chartNode.plan.sourceTableId
    ? useProjectStore.getState().nodes[chartNode.plan.sourceTableId]?.name || 'Unknown'
    : null

  return (
    <>
      <BackToCanvasButton onClick={onBackToCanvas} />
      <div className="h-6 w-px bg-border" />
      <span className="text-sm font-medium">{selectedNode.name}</span>
      <span className="badge badge-purple">Chart</span>
      {chartNode.plan.sourceTableId && (
        <button
          onClick={() => openTable(chartNode.plan.sourceTableId)}
          className="text-xs text-accent-green hover:underline ml-2"
        >
          Source: {sourceTableName}
        </button>
      )}
      <div className="flex-1" />
    </>
  )
}

function SimpleHeaderContent({ label, onBackToCanvas }: { label: string; onBackToCanvas: () => void }) {
  return (
    <>
      <BackToCanvasButton onClick={onBackToCanvas} />
      <div className="h-6 w-px bg-border" />
      <span className="text-sm font-medium">{label}</span>
      <div className="flex-1" />
    </>
  )
}

function ExportDropdownMenu({
  onExport,
  onImport,
  onDashboard,
}: {
  onExport: () => void
  onImport: () => void
  onDashboard: () => void
}) {
  return (
    <div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
      <button onClick={onExport} className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <div>
          <div className="font-medium">Export Project</div>
          <div className="text-xs text-text-tertiary">ZIP with project file + Excel data</div>
        </div>
      </button>

      <div className="border-t border-border my-1" />

      <button onClick={onImport} className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <div>
          <div className="font-medium">Import Project</div>
          <div className="text-xs text-text-tertiary">Load from .tablecanvas.json</div>
        </div>
      </button>

      <div className="border-t border-border my-1" />

      <button onClick={onDashboard} className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3">
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
