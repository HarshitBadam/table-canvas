import { useState, useCallback, lazy, Suspense, useMemo } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { AppHeader } from './AppHeader'
import { NavigationProvider } from './NavigationContext'
import { useProjectExport } from './useProjectExport'
import { CanvasView } from '@/canvas/CanvasView'
import { GridView } from '@/grid/GridView'
import { ChartView } from '@/charts/ChartView'
import { Dashboard } from '@/dashboard/Dashboard'
import { useProjectStore } from '@/state/projectStore'
import { useReportStore } from '@/report/reportStore'
import { useApp } from '@/state/AppContext'
import { LoginPage } from '@/auth/LoginPage'
import { EarlyAccessPage } from '@/auth/EarlyAccessPage'
import { LoadingScreen } from '@/components/LoadingScreen'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { StorageWarningBanner } from '@/persistence/StorageWarningBanner'

const ReportView = lazy(() => import('@/report/ReportView').then(m => ({ default: m.ReportView })))

export type ViewMode = 'canvas' | 'grid' | 'chart' | 'dashboard' | 'report'

export default function App() {
  const { isLoading, phase, phaseMessage, error, isAuthenticated } = useApp()

  if (isLoading) {
    return <LoadingScreen phase={phase} message={phaseMessage} />
  }

  if (error && phase === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
          <p className="text-sm text-text-secondary mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">
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
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/early-access"
          element={isAuthenticated ? <Navigate to="/" replace /> : <EarlyAccessPage />}
        />
        <Route
          path="/*"
          element={isAuthenticated ? <MainApp /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </ErrorBoundary>
  )
}

function MainApp() {
  const { projectLimitViolation, setProjectLimitViolation } = useApp()
  const [viewMode, setViewMode] = useState<ViewMode>('canvas')

  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const selectedNode = useProjectStore((state) =>
    state.selectedNodeId ? state.nodes[state.selectedNodeId] : null
  )
  const selectNode = useProjectStore((state) => state.selectNode)

  const reports = useReportStore((state) => state.reports)
  const selectedReportId = useReportStore((state) => state.selectedReportId)
  const addReport = useReportStore((state) => state.addReport)
  const selectReport = useReportStore((state) => state.selectReport)

  const reportId = selectedReportId || Object.keys(reports)[0] || null

  const handleBackToCanvas = useCallback(() => setViewMode('canvas'), [])

  const exportState = useProjectExport(handleBackToCanvas)

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

  const handleOpenDashboard = useCallback(() => setViewMode('dashboard'), [])

  const handleOpenReport = useCallback(() => {
    let activeReportId = reportId
    if (!activeReportId) {
      activeReportId = addReport('My Report')
    }
    selectReport(activeReportId)
    setViewMode('report')
  }, [reportId, addReport, selectReport])

  const handleOpenTable = useCallback((tableId: string) => {
    selectNode(tableId)
    setViewMode('grid')
  }, [selectNode])

  const handleOpenChart = useCallback((chartId: string) => {
    selectNode(chartId)
    setViewMode('chart')
  }, [selectNode])

  const navigationValue = useMemo(() => ({
    openTable: handleOpenTable,
    openChart: handleOpenChart,
    openCanvas: handleBackToCanvas,
    openDashboard: handleOpenDashboard,
    openReport: handleOpenReport,
  }), [handleOpenTable, handleOpenChart, handleBackToCanvas, handleOpenDashboard, handleOpenReport])

  return (
    <NavigationProvider value={navigationValue}>
      <StorageWarningBanner />
      <div className="flex h-full bg-canvas">
        <Sidebar />

        <main className="flex-1 flex flex-col overflow-hidden">
          <AppHeader
            viewMode={viewMode}
            selectedNode={selectedNode}
            exportState={exportState}
            onBackToCanvas={handleBackToCanvas}
            onOpenDashboard={handleOpenDashboard}
          />

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
                <ChartView chartId={selectedNodeId} />
              </ErrorBoundary>
            )}
            {viewMode === 'dashboard' && (
              <ErrorBoundary name="Dashboard">
                <Dashboard />
              </ErrorBoundary>
            )}
            {viewMode === 'report' && reportId && (
              <ErrorBoundary name="ReportView">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <LoadingSpinner />
                  </div>
                }>
                  <ReportView reportId={reportId} />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
        </main>
      </div>

      <UpgradePrompt
        open={!!projectLimitViolation}
        onOpenChange={(open) => { if (!open) setProjectLimitViolation(null) }}
        violation={projectLimitViolation}
      />
    </NavigationProvider>
  )
}
