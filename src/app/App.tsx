import { useState, useCallback, lazy, Suspense, useRef, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CanvasView } from '@/canvas/CanvasView'
import { GridView } from '@/grid/GridView'
import { ChartView } from '@/charts/ChartView'
import { Dashboard } from '@/dashboard/Dashboard'
import { useProjectStore } from '@/state/projectStore'
import { useReportStore } from '@/report/reportStore'
import { useApp, useAppAuth } from '@/state/appContext'
import { LoginPage } from '@/auth/LoginPage'
import { EarlyAccessPage } from '@/auth/EarlyAccessPage'
import { LoadingScreen } from '@/components/LoadingScreen'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorBoundary } from '@/design/components'
import { exportReportToPDF } from '@/report/pdfExport'
import { parseImportFile } from '@/persistence/db'
import { importProjectWithSync } from '@/persistence/syncService'
import { exportAndDownloadProject } from '@/persistence/exportService'
import type { ChartNode } from '@/lib/types'

// Lazy load ReportView for code splitting
const ReportView = lazy(() => import('@/report/ReportView').then(m => ({ default: m.ReportView })))

export type ViewMode = 'canvas' | 'grid' | 'chart' | 'dashboard' | 'report'

// ============================================================================
// Main App Component with routing
// ============================================================================

export default function App() {
  const { isLoading, phase, phaseMessage, error, isAuthenticated } = useApp()

  // Show loading screen during initialization
  if (isLoading) {
    return <LoadingScreen phase={phase} message={phaseMessage} />
  }

  // Show error screen
  if (error && phase === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            {error}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="btn btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary name="App">
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
          }
        />
        <Route
          path="/early-access"
          element={
            isAuthenticated ? <Navigate to="/" replace /> : <EarlyAccessPage />
          }
        />
        <Route
          path="/*"
          element={
            isAuthenticated ? <MainApp /> : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </ErrorBoundary>
  )
}

// ============================================================================
// Main Application (authenticated)
// ============================================================================

function MainApp() {
  const [viewMode, setViewMode] = useState<ViewMode>('canvas')
  
  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const selectedNode = useProjectStore((state) => 
    state.selectedNodeId ? state.nodes[state.selectedNodeId] : null
  )
  const selectNode = useProjectStore((state) => state.selectNode)
  const projectId = useProjectStore((state) => state.projectId)
  const projectName = useProjectStore((state) => state.projectName)
  
  // Report store - multi-report mode
  const reports = useReportStore((state) => state.reports)
  const selectedReportId = useReportStore((state) => state.selectedReportId)
  const addReport = useReportStore((state) => state.addReport)
  const selectReport = useReportStore((state) => state.selectReport)
  
  // Get the active report ID (selected one, or first if none selected)
  const reportId = selectedReportId || Object.keys(reports)[0] || null
  
  const { user, logout } = useAppAuth()
  const { isSaving, loadProject } = useApp()
  
  // Export/Import state
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string>('')
  const [exportError, setExportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false)
      }
    }
    
    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [exportDropdownOpen])
  
  // Clear error after a delay
  useEffect(() => {
    if (exportError) {
      const timer = setTimeout(() => setExportError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [exportError])
  
  // Handle project export (ZIP with Excel + JSON)
  const handleExport = useCallback(async () => {
    if (!projectId) return
    
    setIsExporting(true)
    setExportDropdownOpen(false)
    setExportError(null)
    setExportProgress('Starting export...')
    
    try {
      await exportAndDownloadProject(projectId, projectName || 'project', {
        includeExcel: true,
        onProgress: (message) => {
          setExportProgress(message)
        }
      })
      
      console.log('[Export] ZIP download triggered successfully')
      setExportProgress('')
    } catch (err) {
      console.error('[Export] Failed:', err)
      setExportError(err instanceof Error ? err.message : 'Export failed')
      setExportProgress('')
    } finally {
      setIsExporting(false)
    }
  }, [projectId, projectName])
  
  // Handle import file selection
  const handleImportClick = useCallback(() => {
    setExportDropdownOpen(false)
    importInputRef.current?.click()
  }, [])
  
  // Handle import file processing
  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    // Reset the input so the same file can be selected again
    event.target.value = ''
    
    setIsImporting(true)
    setExportError(null)
    
    try {
      // Step 1: Parse the import file (restores files to IndexedDB)
      console.log('[Import] Parsing import file...')
      const parsedData = await parseImportFile(file)
      
      // Step 2: Create project with proper server sync (gets valid ID from server)
      console.log('[Import] Creating project with server sync...')
      const importedProject = await importProjectWithSync({
        name: parsedData.name,
        nodes: parsedData.nodes,
        edges: parsedData.edges,
        patches: parsedData.patches,
      })
      
      console.log('[Import] Project imported successfully:', importedProject.id)
      
      // Step 3: Load the imported project into app state
      await loadProject(importedProject.id)
      
      // Switch to canvas view to see the imported project
      setViewMode('canvas')
    } catch (err) {
      console.error('[Import] Failed:', err)
      setExportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }, [loadProject])

  // When a node is double-clicked, switch to appropriate view
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const node = useProjectStore.getState().nodes[nodeId]
    if (node && (node.kind === 'source_table' || node.kind === 'derived_table')) {
      selectNode(nodeId)
      setViewMode('grid')
    } else if (node && node.kind === 'chart') {
      selectNode(nodeId)
      setViewMode('chart')
    }
  }, [selectNode])

  const handleBackToCanvas = useCallback(() => {
    setViewMode('canvas')
  }, [])

  const handleOpenDashboard = useCallback(() => {
    setViewMode('dashboard')
  }, [])

  // Handle opening the report (auto-create if none exists)
  const handleOpenReport = useCallback(() => {
    let activeReportId = reportId
    if (!activeReportId) {
      // Create a new report if none exists
      activeReportId = addReport('My Report')
    }
    selectReport(activeReportId)
    setViewMode('report')
  }, [reportId, addReport, selectReport])

  // Handle opening a table from sidebar
  const handleOpenTable = useCallback((tableId: string) => {
    selectNode(tableId)
    setViewMode('grid')
  }, [selectNode])

  // Handle opening a chart from sidebar
  const handleOpenChart = useCallback((chartId: string) => {
    selectNode(chartId)
    setViewMode('chart')
  }, [selectNode])

  // Handle navigating from chart view to table grid view
  const handleNavigateToTable = useCallback((tableId: string) => {
    selectNode(tableId)
    setViewMode('grid')
  }, [selectNode])

  return (
    <div className="flex h-full bg-canvas">
      <Sidebar 
        onOpenTable={handleOpenTable}
        onOpenChart={handleOpenChart}
        onOpenCanvas={handleBackToCanvas}
        onOpenDashboard={handleOpenDashboard}
        onOpenReport={handleOpenReport}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-12 border-b border-border bg-surface flex items-center px-4 gap-4">
          {viewMode === 'grid' && selectedNode && (
            <>
              <button
                onClick={handleBackToCanvas}
                className="btn btn-ghost gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Canvas
              </button>
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
          )}
          {viewMode === 'chart' && selectedNode && (
            <>
              <button
                onClick={handleBackToCanvas}
                className="btn btn-ghost gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Canvas
              </button>
              <div className="h-6 w-px bg-border" />
              <span className="text-sm font-medium">{selectedNode.name}</span>
              <span className="badge badge-purple">Chart</span>
              {selectedNode.kind === 'chart' && (selectedNode as ChartNode).plan.sourceTableId && (
                <button
                  onClick={() => handleNavigateToTable((selectedNode as ChartNode).plan.sourceTableId)}
                  className="text-xs text-accent-green hover:underline ml-2"
                >
                  Source: {useProjectStore.getState().nodes[(selectedNode as ChartNode).plan.sourceTableId]?.name || 'Unknown'}
                </button>
              )}
              <div className="flex-1" />
            </>
          )}
          {viewMode === 'dashboard' && (
            <>
              <button
                onClick={handleBackToCanvas}
                className="btn btn-ghost gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Canvas
              </button>
              <div className="h-6 w-px bg-border" />
              <span className="text-sm font-medium">Dashboard</span>
              <div className="flex-1" />
            </>
          )}
          {viewMode === 'report' && (
            <>
              <button
                onClick={handleBackToCanvas}
                className="btn btn-ghost gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Canvas
              </button>
              <div className="h-6 w-px bg-border" />
              <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium">Report</span>
              <div className="flex-1" />
              <button
                onClick={() => {
                  // Select the actual editor content, not the scroll container
                  const reportContent = document.querySelector('.report-view .tiptap-editor-content');
                  const currentReportId = useReportStore.getState().selectedReportId;
                  const report = currentReportId ? useReportStore.getState().reports[currentReportId] : null;
                  if (reportContent) {
                    exportReportToPDF(reportContent as HTMLElement, {
                      reportName: report?.name || 'Report',
                    });
                  }
                }}
                className="btn btn-secondary gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
            </>
          )}
          {viewMode === 'canvas' && (
            <>
              <span className="text-sm font-medium text-text-secondary">
                Table Canvas
              </span>
              <div className="flex-1" />
              
              {/* Error Toast */}
              {exportError && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-600 rounded-md text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {exportError}
                </div>
              )}
              
              {/* Export/Import Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                  disabled={isExporting || isImporting}
                  className="btn btn-secondary gap-2"
                >
                  {(isExporting || isImporting) ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
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
                  <div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
                    <button
                      onClick={handleExport}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3"
                    >
                      <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <div>
                        <div className="font-medium">Export Project</div>
                        <div className="text-xs text-text-tertiary">ZIP with project file + Excel data</div>
                      </div>
                    </button>
                    
                    <div className="border-t border-border my-1" />
                    
                    <button
                      onClick={handleImportClick}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3"
                    >
                      <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <div>
                        <div className="font-medium">Import Project</div>
                        <div className="text-xs text-text-tertiary">Load from .tablecanvas.json</div>
                      </div>
                    </button>
                    
                    <div className="border-t border-border my-1" />
                    
                    <button
                      onClick={() => {
                        setExportDropdownOpen(false)
                        handleOpenDashboard()
                      }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-hover flex items-center gap-3"
                    >
                      <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <div>
                        <div className="font-medium">Dashboard</div>
                        <div className="text-xs text-text-tertiary">View charts dashboard</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
              
              {/* Hidden file input for import */}
              <input
                ref={importInputRef}
                type="file"
                accept=".json,.tablecanvas.json"
                onChange={handleImportFile}
                className="hidden"
              />
            </>
          )}
          
          {/* Saving Indicator */}
          {isSaving && (
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs">Saving...</span>
            </div>
          )}
          
          {/* User Menu */}
          <div className="h-6 w-px bg-border ml-2" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">
              {user?.name || user?.email}
            </span>
            {/* Hide logout button in local mode - no real session to log out of */}
            {user?.id !== 'local-user' && (
              <button
                onClick={logout}
                className="btn btn-ghost text-xs px-2 py-1"
                title="Sign out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
        </header>

        {/* Main Content - Wrapped with Error Boundaries */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'canvas' && (
            <ErrorBoundary name="CanvasView">
              <CanvasView onNodeDoubleClick={handleNodeDoubleClick} />
            </ErrorBoundary>
          )}
          {viewMode === 'grid' && selectedNodeId && (
            <ErrorBoundary name="GridView">
              <GridView tableId={selectedNodeId} />
            </ErrorBoundary>
          )}
          {viewMode === 'chart' && selectedNodeId && (
            <ErrorBoundary name="ChartView">
              <ChartView chartId={selectedNodeId} onNavigateToTable={handleNavigateToTable} />
            </ErrorBoundary>
          )}
          {viewMode === 'dashboard' && (
            <ErrorBoundary name="Dashboard">
              <Dashboard 
                onOpenTable={handleOpenTable}
                onOpenChart={handleOpenChart}
              />
            </ErrorBoundary>
          )}
          {viewMode === 'report' && reportId && (
            <ErrorBoundary name="ReportView">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <LoadingSpinner />
                </div>
              }>
                <ReportView 
                  reportId={reportId}
                  onOpenTable={handleOpenTable}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      </main>
    </div>
  )
}
