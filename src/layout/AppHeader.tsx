import { useCallback, useEffect, useRef } from 'react'
import { useProjectStore } from '@/state/projectStore'
import { useApp, useAppAuth } from '@/state/AppContext'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/useWorkspaceLease'
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
  onOpenNavigation: () => void
}

export function AppHeader({
  viewMode,
  selectedNode,
  exportState,
  onOpenNavigation,
}: AppHeaderProps) {
  const { user, logout, leaveGuest } = useAppAuth()
  const { isSaving } = useApp()
  const { canEdit } = useWorkspaceLease()
  const canUndo = useProjectStore(state => state.history.past.length > 0)
  const canRedo = useProjectStore(state => state.history.future.length > 0)
  const undo = useProjectStore(state => state.undo)
  const redo = useProjectStore(state => state.redo)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const exportMenuModalityRef = useRef<'pointer' | 'keyboard'>('pointer')

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
    if (!exportDropdownOpen || exportMenuModalityRef.current !== 'keyboard') return
    const frame = requestAnimationFrame(() => {
      dropdownRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus()
      exportMenuModalityRef.current = 'pointer'
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

  const handleExportTriggerKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      exportMenuModalityRef.current = 'keyboard'
      setExportDropdownOpen(true)
    } else if (event.key === 'Enter' || event.key === ' ') {
      exportMenuModalityRef.current = 'keyboard'
    }
  }, [setExportDropdownOpen])

  const restoreExportTriggerFocus = useCallback(() => {
    setExportDropdownOpen(false)
    requestAnimationFrame(() => exportButtonRef.current?.focus())
  }, [setExportDropdownOpen])

  const handleProjectExport = useCallback(() => {
    restoreExportTriggerFocus()
    handleExport()
  }, [handleExport, restoreExportTriggerFocus])

  const handleProjectImport = useCallback(() => {
    restoreExportTriggerFocus()
    handleImportClick()
  }, [handleImportClick, restoreExportTriggerFocus])

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
      {viewMode === 'canvas' && (
        <div className="flex self-stretch items-center border-r border-border-subtle pr-2 sm:pr-3">
          <ProjectSwitcher />
        </div>
      )}
      {viewMode === 'grid' && selectedNode && (
        <GridHeaderContent selectedNode={selectedNode} />
      )}
      {viewMode === 'chart' && selectedNode && (
        <ChartHeaderContent selectedNode={selectedNode} />
      )}
      {viewMode === 'dashboard' && (
        <ProjectSwitcherHeader mode="switch-only" />
      )}
      {viewMode === 'report' && (
        <>
          <ProjectSwitcherHeader mode="switch-only" />
          {isSaving && (
            <div className="flex shrink-0 items-center gap-1.5 text-text-tertiary" role="status" aria-live="polite">
              <LoadingSpinner size="sm" className="h-3 w-3" />
              <span className="hidden text-xs sm:inline">Saving...</span>
            </div>
          )}
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

          {isSaving && (
            <div
              className="flex shrink-0 items-center gap-1.5 text-text-tertiary"
              role="status"
              aria-live="polite"
            >
              <LoadingSpinner size="sm" className="h-3 w-3" />
              <span className="hidden text-xs sm:inline">Saving...</span>
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
              onPointerDown={() => {
                exportMenuModalityRef.current = 'pointer'
              }}
              onKeyDown={handleExportTriggerKeyDown}
              onClick={(event) => {
                if (event.detail > 0) exportMenuModalityRef.current = 'pointer'
                setExportDropdownOpen(!exportDropdownOpen)
              }}
              disabled={isExporting || isImporting}
              aria-haspopup="menu"
              aria-expanded={exportDropdownOpen}
              aria-controls="project-actions-menu"
              aria-label="Import or export project"
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
                  <span className="hidden sm:inline">Import / Export</span>
                  <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>

            {exportDropdownOpen && (
              <ProjectActionsMenu
                onExport={handleProjectExport}
                onImport={handleProjectImport}
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
            disabled={!canUndo || !canEdit}
            className="btn btn-ghost p-1.5 disabled:opacity-40"
            aria-label="Undo"
            title={canEdit ? 'Undo' : EDITING_ELSEWHERE_TOOLTIP}
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo || !canEdit}
            className="btn btn-ghost p-1.5 disabled:opacity-40"
            aria-label="Redo"
            title={canEdit ? 'Redo' : EDITING_ELSEWHERE_TOOLTIP}
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      )}

      {viewMode !== 'canvas' && viewMode !== 'report' && isSaving && (
        <div className="flex items-center gap-1.5 text-text-tertiary" role="status" aria-live="polite">
          <LoadingSpinner size="sm" className="h-3 w-3" />
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
      {user?.id === 'local-user' && (
        <button
          type="button"
          onClick={() => {
            void leaveGuest()
              .then(() => window.location.assign('/login'))
              .catch(() => undefined)
          }}
          className="btn btn-primary ml-2 gap-2 max-lg:min-h-11 max-lg:min-w-11 max-lg:p-0"
          aria-label="Sign in to sync"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden lg:inline">Sign in to sync</span>
        </button>
      )}
    </header>
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

function ProjectSwitcherHeader({ mode = 'full' }: { mode?: 'full' | 'switch-only' }) {
  return (
    <>
      <div className="flex self-stretch items-center border-r border-border-subtle pr-2 sm:pr-3">
        <ProjectSwitcher mode={mode} />
      </div>
      <div className="flex-1" />
    </>
  )
}
