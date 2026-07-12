import { useState, useCallback, lazy, Suspense, useMemo } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { AppHeader } from './AppHeader'
import { NavigationProvider } from './NavigationProvider'
import { useProjectExport } from './useProjectExport'
import { WORKSPACE_NAV_ITEMS, type WorkspaceNavId } from './viewNavigation'
import { CanvasView } from '@/canvas/CanvasView'
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

const GridView = lazy(() => import('@/grid/GridView').then(m => ({ default: m.GridView })))
const ChartView = lazy(() => import('@/charts/ChartView').then(m => ({ default: m.ChartView })))
const Dashboard = lazy(() => import('@/dashboard/Dashboard').then(m => ({ default: m.Dashboard })))
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
  const [navigationOpen, setNavigationOpen] = useState(false)

  const selectedNodeId = useProjectStore((state) => state.selectedNodeId)
  const selectedNode = useProjectStore((state) =>
    state.selectedNodeId ? state.nodes[state.selectedNodeId] : null
  )
  const selectNode = useProjectStore((state) => state.selectNode)

  const reports = useReportStore((state) => state.reports)
  const selectedReportId = useReportStore((state) => state.selectedReportId)

  const reportId = selectedReportId || Object.keys(reports)[0] || null

  const handleBackToCanvas = useCallback(() => {
    setViewMode('canvas')
    setNavigationOpen(false)
  }, [])

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

  const handleOpenDashboard = useCallback(() => {
    setViewMode('dashboard')
    setNavigationOpen(false)
  }, [])

  const handleOpenReport = useCallback(() => {
    setViewMode('report')
    setNavigationOpen(false)
  }, [])

  const handleOpenTable = useCallback((tableId: string) => {
    selectNode(tableId)
    setViewMode('grid')
    setNavigationOpen(false)
  }, [selectNode])

  const handleOpenChart = useCallback((chartId: string) => {
    selectNode(chartId)
    setViewMode('chart')
    setNavigationOpen(false)
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
      <div className="relative flex h-full min-h-0 bg-canvas">
        <Sidebar isOpen={navigationOpen} onClose={() => setNavigationOpen(false)} />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader
            viewMode={viewMode}
            selectedNode={selectedNode}
            exportState={exportState}
            onBackToCanvas={handleBackToCanvas}
            onOpenNavigation={() => setNavigationOpen(true)}
          />

          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={
              <div className="flex h-full items-center justify-center" role="status" aria-label="Loading view">
                <LoadingSpinner />
              </div>
            }>
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
              {viewMode === 'report' && (
                <ErrorBoundary name="ReportView">
                  <ReportView reportId={reportId} onOpenTable={handleOpenTable} />
                </ErrorBoundary>
              )}
            </Suspense>
          </div>
          <MobileBottomNav
            viewMode={viewMode}
            onOpenCanvas={handleBackToCanvas}
            onOpenDashboard={handleOpenDashboard}
            onOpenReport={handleOpenReport}
          />
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

function MobileBottomNav({
  viewMode,
  onOpenCanvas,
  onOpenDashboard,
  onOpenReport,
}: {
  viewMode: ViewMode
  onOpenCanvas: () => void
  onOpenDashboard: () => void
  onOpenReport: () => void
}) {
  const canvasActive = viewMode === 'canvas' || viewMode === 'grid' || viewMode === 'chart'
  const actions: Record<WorkspaceNavId, () => void> = {
    canvas: onOpenCanvas,
    dashboard: onOpenDashboard,
    report: onOpenReport,
  }
  const items = WORKSPACE_NAV_ITEMS.map(item => ({
    ...item,
    active: item.id === 'canvas' ? canvasActive : viewMode === item.id,
    onClick: actions[item.id],
  }))

  return (
    <nav
      aria-label="Workspace"
      className="safe-area-bottom grid shrink-0 grid-cols-3 border-t border-border bg-surface lg:hidden"
    >
      {items.map(item => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          aria-current={item.active ? 'page' : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 px-2 text-xs font-medium ${
            item.active ? 'bg-accent-green/10 text-accent-text' : 'text-text-secondary'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.iconPath} />
          </svg>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
