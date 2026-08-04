import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, useAppAuth } from '@/state/AppContext'
import { LoadingSpinner } from './LoadingSpinner'
import { EditingElsewhereBanner } from './EditingElsewhereBanner'
import { focusMenuItem } from '@/lib/focusMenuItem'
import { AccountMenu } from './AccountMenu'
import { ProjectActionsMenu } from './project-controls/ProjectActionsMenu'
import { ProjectSwitcher } from './project-controls/ProjectSwitcher'
import type { ProjectNode } from '@/types'
import type { ViewMode } from './navigation/viewNavigation'
import type { ProjectExportState } from './project-controls/useProjectExport'
import { GuestSignInDialog } from './project-controls/ProjectDialogs'
import { hasUnexportedActivity } from './project-controls/projectActivity'
import { getStorageScope } from '@/persistence/storage/storageScope'
import {
  ChartHeaderContent,
  GridHeaderContent,
  ProjectSwitcherHeader,
} from './AppHeaderSections'

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
  const { user, leaveGuest } = useAppAuth()
  const { isSaving, projects } = useApp()
  const [guestSignInOpen, setGuestSignInOpen] = useState(false)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const exportMenuModalityRef = useRef<'pointer' | 'keyboard'>('pointer')

  const {
    isExporting,
    isImporting,
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

  useEffect(() => {
    if (!exportDropdownOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setExportDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [dropdownRef, exportDropdownOpen, setExportDropdownOpen])

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

  const isBusy = isExporting || isImporting
  const continueToSignIn = useCallback(() => {
    setGuestSignInOpen(false)
    void leaveGuest().catch(() => undefined)
  }, [leaveGuest])

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
        <ProjectSwitcherHeader />
      )}
      {viewMode === 'report' && (
        <>
          <ProjectSwitcherHeader />
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
            className="relative flex self-stretch items-center pl-0 md:border-l md:border-border-subtle md:pl-3"
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
              type="button"
              onPointerDown={() => {
                exportMenuModalityRef.current = 'pointer'
              }}
              onKeyDown={handleExportTriggerKeyDown}
              onClick={(event) => {
                if (event.detail > 0) exportMenuModalityRef.current = 'pointer'
                setExportDropdownOpen(!exportDropdownOpen)
              }}
              aria-haspopup="menu"
              aria-expanded={exportDropdownOpen}
              aria-controls="project-actions-menu"
              aria-busy={isBusy}
              aria-label="Import or export project"
              title="Import or export project"
              className="flex h-12 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md p-0 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary md:w-auto md:px-2.5"
            >
              <svg className="h-7 w-7 shrink-0 rounded-full bg-surface-secondary p-1.5 text-text-tertiary md:h-4 md:w-4 md:rounded-none md:bg-transparent md:p-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0-4-4m4 4V4" />
              </svg>
              <span className="hidden md:inline">Import / Export</span>
              <svg
                className={`hidden h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-150 md:block ${exportDropdownOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
              </svg>
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

      {viewMode !== 'canvas' && viewMode !== 'report' && isSaving && (
        <div className="flex items-center gap-1.5 text-text-tertiary" role="status" aria-live="polite">
          <LoadingSpinner size="sm" className="h-3 w-3" />
          <span className="hidden text-xs sm:inline">Saving...</span>
        </div>
      )}

      <EditingElsewhereBanner />

      {user?.id !== 'local-user' && (
        <>
          <div
            className="mx-1 hidden self-stretch w-px bg-border-subtle md:block"
            aria-hidden="true"
          />
          <AccountMenu />
        </>
      )}
      {user?.id === 'local-user' && (
        <>
          <div
            className="mx-1 hidden self-stretch w-px bg-border-subtle md:block"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => {
              const hasWork = hasUnexportedActivity(
                getStorageScope(),
                projects.map(project => project.id),
              )
              if (hasWork) setGuestSignInOpen(true)
              else continueToSignIn()
            }}
            className="flex h-12 min-w-11 shrink-0 items-center gap-2.5 rounded-md px-1.5 transition-colors hover:bg-surface-secondary md:px-2"
            aria-label="Sign in to sync"
            title="Sign in to sync"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-green text-white"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z" />
              </svg>
            </span>
            <span className="hidden text-left lg:block">
              <span className="block text-xs font-medium text-text-tertiary">Guest</span>
              <span className="block text-sm font-semibold text-accent-text">Sign in to sync</span>
            </span>
          </button>
          <GuestSignInDialog
            open={guestSignInOpen}
            onOpenChange={setGuestSignInOpen}
            onContinue={continueToSignIn}
          />
        </>
      )}
    </header>
  )
}
