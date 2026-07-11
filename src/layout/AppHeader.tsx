import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useReportStore } from '@/report/reportStore'
import { useApp, useAppAuth } from '@/state/AppContext'
import { exportReportToPDF } from '@/report/pdfExport'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { focusMenuItem } from '@/lib/focusMenuItem'
import { useNavigation } from './NavigationContext'
import { ProjectActionsMenu } from './ProjectActionsMenu'
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
  const canUndo = useProjectStore(state => state.history.past.length > 0)
  const canRedo = useProjectStore(state => state.history.future.length > 0)
  const undo = useProjectStore(state => state.undo)
  const redo = useProjectStore(state => state.redo)
  const [isExportingReport, setIsExportingReport] = useState(false)
  const [reportExportError, setReportExportError] = useState<string | null>(null)
  const exportButtonRef = useRef<HTMLButtonElement>(null)

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

  useEffect(() => {
    if (!exportDropdownOpen) return
    const frame = requestAnimationFrame(() => {
      dropdownRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [dropdownRef, exportDropdownOpen])

  const handleExportMenuKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!exportDropdownOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      setExportDropdownOpen(false)
      exportButtonRef.current?.focus()
      return
    }
    focusMenuItem(event, dropdownRef.current)
  }, [dropdownRef, exportDropdownOpen, setExportDropdownOpen])

  const handleExportPDF = useCallback(async () => {
    const reportContent = document.querySelector('.report-view .tiptap-editor-content')
    const currentReportId = useReportStore.getState().selectedReportId
    const report = currentReportId ? useReportStore.getState().reports[currentReportId] : null
    if (!reportContent || !report) {
      setReportExportError('Open a report before exporting.')
      return
    }
    setIsExportingReport(true)
    setReportExportError(null)
    try {
      await useReportStore.getState().flushSaves()
      await exportReportToPDF(reportContent as HTMLElement, {
        reportName: report.name || 'Report',
      })
    } catch (error) {
      setReportExportError(error instanceof Error ? error.message : 'PDF export failed')
    } finally {
      setIsExportingReport(false)
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
          {reportExportError && (
            <span className="text-xs text-red-600" role="alert">{reportExportError}</span>
          )}
          <button
            onClick={handleExportPDF}
            disabled={isExportingReport}
            className="btn btn-secondary gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {isExportingReport ? 'Exporting…' : 'Export PDF'}
          </button>
        </>
      )}
      {viewMode === 'canvas' && (
        <>
          <span className="text-sm font-medium text-text-secondary">Table Canvas</span>
          <div className="flex-1" />

          {exportError && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-600 rounded-md text-sm"
              role="alert"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {exportError}
            </div>
          )}

          <div
            className="relative"
            ref={dropdownRef}
            onKeyDown={handleExportMenuKeyDown}
          >
            <button
              ref={exportButtonRef}
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              disabled={isExporting || isImporting}
              aria-haspopup="menu"
              aria-expanded={exportDropdownOpen}
              aria-controls="project-export-menu"
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
              <ProjectActionsMenu
                onExport={handleExport}
                onImport={handleImportClick}
                onDashboard={() => { setExportDropdownOpen(false); onOpenDashboard() }}
              />
            )}
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept=".zip,.tablecanvas.zip,.json,.tablecanvas.json"
            onChange={handleImportFile}
            className="hidden"
          />
        </>
      )}

      {viewMode === 'grid' && (
        <div className="flex items-center gap-1" role="group" aria-label="Edit history">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="btn btn-ghost p-1.5 disabled:opacity-40"
            aria-label="Undo"
            title="Undo"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7H5v4m0 0c2-4 7-6 11-3 3 2 4 6 2 9" />
            </svg>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="btn btn-ghost p-1.5 disabled:opacity-40"
            aria-label="Redo"
            title="Redo"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7h4v4m0 0c-2-4-7-6-11-3-3 2-4 6-2 9" />
            </svg>
          </button>
        </div>
      )}

      {isSaving && (
        <div className="flex items-center gap-1.5 text-text-tertiary" role="status" aria-live="polite">
          <LoadingSpinner size="sm" className="w-3 h-3" />
          <span className="text-xs">Saving...</span>
        </div>
      )}

      <div className="h-6 w-px bg-border ml-2" />
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">{user?.name || user?.email}</span>
        {user?.id !== 'local-user' && (
          <button
            onClick={logout}
            className="btn btn-ghost text-xs px-2 py-1"
            title="Sign out"
            aria-label="Sign out"
          >
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
