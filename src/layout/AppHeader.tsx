import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useReportStore } from '@/report/reportStore'
import { useApp, useAppAuth } from '@/state/AppContext'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { focusMenuItem } from '@/lib/focusMenuItem'
import { useNavigation } from './NavigationContext'
import { ProjectActionsMenu } from './ProjectActionsMenu'
import { ProjectSwitcher } from './ProjectSwitcher'
import type { ChartNode, ProjectNode } from '@/types'
import type { ViewMode } from './App'
import type { ProjectExportState } from './useProjectExport'

interface AppHeaderProps {
  viewMode: ViewMode
  selectedNode: ProjectNode | null
  exportState: ProjectExportState
  onBackToCanvas: () => void
  onOpenNavigation: () => void
}

export function AppHeader({
  viewMode,
  selectedNode,
  exportState,
  onBackToCanvas,
  onOpenNavigation,
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
      const { exportReportToPDF } = await import('@/report/pdfExport')
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
    <header className="safe-area-top flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:gap-3 sm:px-3">
      <button
        type="button"
        onClick={onOpenNavigation}
        className="btn btn-ghost min-h-11 min-w-11 shrink-0 p-0 lg:hidden"
        aria-label="Open navigation"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="flex self-stretch items-center border-r border-border-subtle pr-2 sm:pr-3">
        {viewMode === 'canvas'
          ? <ProjectSwitcher />
          : <BackToCanvasButton onClick={onBackToCanvas} />}
      </div>
      {viewMode === 'grid' && selectedNode && (
        <GridHeaderContent selectedNode={selectedNode} />
      )}
      {viewMode === 'chart' && selectedNode && (
        <ChartHeaderContent selectedNode={selectedNode} />
      )}
      {viewMode === 'dashboard' && (
        <SimpleHeaderContent label="Dashboard" />
      )}
      {viewMode === 'report' && (
        <>
          <svg className="hidden w-4 h-4 text-text-tertiary sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="hidden text-sm font-medium sm:inline">Report</span>
          <div className="flex-1" />
          {reportExportError && (
            <span className="sr-only max-w-48 truncate text-xs text-error-text md:not-sr-only md:inline" role="alert">{reportExportError}</span>
          )}
          <button
            onClick={handleExportPDF}
            disabled={isExportingReport}
            className="btn btn-secondary min-h-11 min-w-11 gap-2 p-0 text-sm sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5"
            aria-label={isExportingReport ? 'Exporting report' : 'Export report as PDF'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">{isExportingReport ? 'Exporting…' : 'Export PDF'}</span>
          </button>
        </>
      )}
      {viewMode === 'canvas' && (
        <>
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
            onBlur={(event) => {
              const nextTarget = event.relatedTarget
              if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
                setExportDropdownOpen(false)
              }
            }}
          >
            <button
              ref={exportButtonRef}
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              disabled={isExporting || isImporting}
              aria-haspopup="menu"
              aria-expanded={exportDropdownOpen}
              aria-controls="project-export-menu"
              aria-label="Export"
              className="btn btn-secondary min-h-11 min-w-11 gap-2 p-0 sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5"
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
                  <span className="hidden sm:inline">Export</span>
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
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 18-6-6 6-6" />
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
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      )}

      {isSaving && (
        <div className="flex items-center gap-1.5 text-text-tertiary" role="status" aria-live="polite">
          <LoadingSpinner size="sm" className="w-3 h-3" />
          <span className="hidden text-xs sm:inline">Saving...</span>
        </div>
      )}

      {user?.id !== 'local-user' && (
        <>
          <div className="ml-2 hidden h-6 w-px bg-border md:block" />
          <div className="flex items-center gap-2">
            <span className="hidden max-w-40 truncate text-sm text-text-secondary md:inline">{user?.name || user?.email}</span>
            <button
              onClick={logout}
              className="btn btn-ghost min-h-11 min-w-11 p-0 text-xs md:min-h-0 md:min-w-0 md:px-2 md:py-1"
              title="Sign out"
              aria-label="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </>
      )}
    </header>
  )
}

function BackToCanvasButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn btn-ghost min-h-11 min-w-11 shrink-0 gap-2 p-0 sm:min-h-0 sm:min-w-0 sm:px-3 sm:py-1.5" aria-label="Back to Canvas">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      <span className="hidden sm:inline">Back to Canvas</span>
    </button>
  )
}

function GridHeaderContent({ selectedNode }: { selectedNode: ProjectNode }) {
  return (
    <>
      <span className="min-w-0 max-w-36 truncate text-sm font-medium sm:max-w-56">{selectedNode.name}</span>
      <span className={`badge hidden md:inline-flex ${selectedNode.kind === 'source_table' ? 'badge-accent' : 'badge-purple'}`}>
        {selectedNode.kind === 'source_table' ? 'Source - Editable' : 'Derived - View Only'}
      </span>
      <div className="flex-1" />
    </>
  )
}

function ChartHeaderContent({
  selectedNode,
}: {
  selectedNode: ProjectNode
}) {
  const { openTable } = useNavigation()
  const chartNode = selectedNode as ChartNode
  const sourceTableName = chartNode.plan.sourceTableId
    ? useProjectStore.getState().nodes[chartNode.plan.sourceTableId]?.name || 'Unknown'
    : null

  return (
    <>
      <span className="min-w-0 max-w-36 truncate text-sm font-medium sm:max-w-56">{selectedNode.name}</span>
      {chartNode.plan.sourceTableId && (
        <button
          onClick={() => openTable(chartNode.plan.sourceTableId)}
          className="ml-2 hidden max-w-48 truncate text-xs text-accent-green hover:underline xl:inline"
        >
          Source - {sourceTableName}
        </button>
      )}
      <div className="flex-1" />
    </>
  )
}

function SimpleHeaderContent({ label }: { label: string }) {
  return (
    <>
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
      <div className="flex-1" />
    </>
  )
}
