import { useState, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { CanvasView } from '@/canvas/CanvasView'
import { GridView } from '@/grid/GridView'
import { ChartView } from '@/charts/ChartView'
import { Dashboard } from '@/dashboard/Dashboard'
import { useProjectStore } from '@/state/projectStore'
import { useApp, useAppAuth } from '@/state/AppContext'
import { LoginPage } from '@/auth/LoginPage'
import { EarlyAccessPage } from '@/auth/EarlyAccessPage'
import { LoadingScreen } from '@/components/LoadingScreen'
import { ErrorBoundary } from '@/design/components'
import type { ChartNode } from '@/lib/types'

export type ViewMode = 'canvas' | 'grid' | 'chart' | 'dashboard'

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
  
  const { user, logout } = useAppAuth()
  const { isSaving } = useApp()

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
        onOpenDashboard={handleOpenDashboard}
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
          {viewMode === 'canvas' && (
            <>
              <span className="text-sm font-medium text-text-secondary">
                Table Canvas
              </span>
              <div className="flex-1" />
              <button
                onClick={handleOpenDashboard}
                className="btn btn-secondary gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Dashboard
              </button>
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
            <button
              onClick={logout}
              className="btn btn-ghost text-xs px-2 py-1"
              title="Sign out"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
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
              />
            </ErrorBoundary>
          )}
        </div>
      </main>
    </div>
  )
}
