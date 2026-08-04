import { useState, useCallback, useEffect, lazy, Suspense, useMemo } from 'react'
import { LoadingSpinner } from '@/layout/LoadingSpinner'
import { useProjectStore } from '@/state/projectStore'
import { useTableRuntimeStore } from '@/state/tableRuntimeStore'
import { EDITING_ELSEWHERE_TOOLTIP } from '@/state/document/useWorkspaceLease'
import { FilterPanel } from './filtering/controls/FilterPanel'
import { FormulaColumnModal } from './formula-column/FormulaColumnModal'
import { GridContextMenu } from './view/GridContextMenu'
import { GridToolbar } from './view/GridToolbar'
import { useColumnResize } from './view/useColumnResize'
import { useGridData } from './useGridData'
import { useGridSelection } from './interaction/useGridSelection'
import { useGridClipboard } from './interaction/useGridClipboard'
import { useGridKeyboard } from './interaction/useGridKeyboard'
import { useGridAutofill } from './editing/useGridAutofill'
import { useGridEditing } from './editing/useGridEditing'
import { useGridOperations } from './editing/useGridOperations'
import { useFormulaColumnLifecycle } from './formula-column/useFormulaColumnLifecycle'
import { GridProvider, type GridContextValue } from './view/GridContext'
import { GridViewport } from './view/GridViewport'
import { GridFeedback, type GridFeedbackMessage } from './view/GridFeedback'
import { DerivedTableEditDialog } from './DerivedTableEditDialog'
import { describeEngineError } from './engineErrorPresentation'

const SuggestionsPanel = lazy(() => import('@/suggestions/panel/SuggestionsPanel').then(m => ({ default: m.SuggestionsPanel })))
const ChartBuilder = lazy(() => import('@/charts/ChartBuilder').then(m => ({ default: m.ChartBuilder })))

interface GridViewProps {
  tableId: string
}

export function GridView({ tableId }: GridViewProps) {
  const toggleCellHighlight = useProjectStore((state) => state.toggleCellHighlight)
  const clearHighlights = useProjectStore((state) => state.clearHighlights)
  const updateCacheInfo = useTableRuntimeStore((state) => state.updateCacheInfo)

  const {
    node, columns, loadedRows, totalRows, getRowAtIndex, unfilteredTotalRows,
    isEditable, canEdit, canMutate, isDirty, isComputing,
    materializationError, setMaterializationError, computationError,
    highlightedCells, tableData, getDisplayValue,
    filters, handleFiltersChange,
    windowed,
  } = useGridData(tableId)
  const rowAccess = useMemo(
    () => ({ totalRows, getRowAtIndex }),
    [getRowAtIndex, totalRows],
  )

  const [gridFeedback, setGridFeedback] = useState<GridFeedbackMessage | null>(null)
  const [derivedEditDialogOpen, setDerivedEditDialogOpen] = useState(false)
  const showGridFeedback = useCallback((feedback: GridFeedbackMessage) => {
    setGridFeedback({ ...feedback, id: Date.now() })
  }, [])
  const requestDerivedTableDuplicate = useCallback(() => {
    if (node?.kind === 'derived_table') setDerivedEditDialogOpen(true)
  }, [node?.kind])

  useEffect(() => {
    if (!gridFeedback) return
    const feedbackId = gridFeedback.id
    const timer = window.setTimeout(() => {
      setGridFeedback(current => current?.id === feedbackId ? null : current)
    }, 6500)
    return () => window.clearTimeout(timer)
  }, [gridFeedback])

  const {
    editingCell, editValue, editError, selectEditValue, setEditValue,
    startEditing, commitEdit, cancelEdit, handleCellDoubleClick,
    editingColumnId, editColumnName, setEditColumnName,
    handleColumnDoubleClick, commitColumnNameEdit, cancelColumnNameEdit,
    saveSnapshot, setCellValue,
  } = useGridEditing(tableId, columns, getRowAtIndex, canMutate, requestDerivedTableDuplicate)

  const {
    selection, setSelection,
    selectedCell, selectedColumn, isHeaderRowSelected, isIndexColumnSelected, isCornerSelected,
    cellRangeSelection, isDraggingSelectionRef, selectCell,
    handleCellMouseDown, handleCellMouseEnter,
    handleColumnClick, handleRowClick, handleCornerClick,
    getRowInsertionIndex, getColumnInsertionIndex,
    getRowInsertionDescription, getColumnInsertionDescription,
    toggleHighlightForSelection,
  } = useGridSelection(tableId, columns, rowAccess)

  const {
    contextMenu, setContextMenu, newColumnModal, setNewColumnModal,
    doInsertRow, openNewColumnModal, doInsertColumn, handleContextMenu, openContextMenu,
    handleInsertRowAbove, handleInsertRowBelow, handleDeleteRow,
    handleInsertColumnLeft, handleInsertColumnRight,
  } = useGridOperations(tableId, columns, rowAccess, canMutate, saveSnapshot, showGridFeedback)
  const closeContextMenu = useCallback(() => setContextMenu(null), [setContextMenu])
  const formulaLifecycle = useFormulaColumnLifecycle(
    tableId,
    columns,
    closeContextMenu,
    showGridFeedback,
  )

  const {
    autofillDragging, autofillEndRow, autofillPreview, autofillColumnId,
    handleAutofillStart, handleAutofillMove, handleAutofillOneRow,
  } = useGridAutofill({
    isEditable: canMutate, columns, rowAccess, cellRangeSelection,
    getDisplayValue, saveSnapshot, setCellValue, tableId,
  })

  const { getSelectedCellData, formatClipboardText } = useGridClipboard(
    tableId, node, columns, rowAccess, getDisplayValue, selection, cellRangeSelection,
  )

  useGridKeyboard({
    editingCell, selectedCell, selection, columns, rowAccess, isEditable: canMutate,
    cellRangeSelection, setSelection, selectCell, commitEdit, cancelEdit, startEditing,
    getDisplayValue, saveSnapshot, setCellValue, tableId,
    getSelectedCellData, formatClipboardText,
    onFeedback: showGridFeedback,
    onReadOnlyEditAttempt: requestDerivedTableDuplicate,
  })

  const {
    getColumnWidth,
    handleResizeStart,
    resizeColumnBy,
    setColumnWidth,
    resizingColumn,
  } = useColumnResize()

  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filterTargetColumnId, setFilterTargetColumnId] = useState<string>()
  const [chartBuilderOpen, setChartBuilderOpen] = useState(false)
  const [chartPreselectedColumn, setChartPreselectedColumn] = useState<string | undefined>(undefined)
  const handleRetry = useCallback(() => {
    updateCacheInfo(tableId, { error: undefined, isDirty: true, isComputing: false })
    setMaterializationError(null)
    windowed.invalidate()
  }, [setMaterializationError, tableId, updateCacheInfo, windowed])

  const isInitialLoad = windowed.isInitialLoading
    || (isComputing && totalRows === 0 && !tableData?.rows?.length)
  const [loadingElapsedSeconds, setLoadingElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!isInitialLoad) {
      setLoadingElapsedSeconds(0)
      return
    }

    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setLoadingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isInitialLoad, tableId])

  useEffect(() => {
    if (!contextMenu) return
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [contextMenu, setContextMenu])

  const handleAddRow = useCallback(() => doInsertRow(getRowInsertionIndex()), [getRowInsertionIndex, doInsertRow])
  const handleAddColumn = useCallback(() => openNewColumnModal(getColumnInsertionIndex()), [getColumnInsertionIndex, openNewColumnModal])
  const handleToggleFilters = useCallback((columnId?: string) => {
    setFilterTargetColumnId(columnId)
    setShowFilterPanel(previous => columnId ? true : !previous)
  }, [])

  const contextValue: GridContextValue = useMemo(() => ({
    tableId, isEditable, canEdit, columns, getDisplayValue, getColumnWidth,
    selection, selectedCell, selectedColumn, isHeaderRowSelected,
    isIndexColumnSelected, isCornerSelected, cellRangeSelection,
    setSelection, handleCellMouseDown, handleCellMouseEnter,
    handleColumnClick, handleRowClick, handleCornerClick,
    toggleHighlightForSelection, isDraggingSelectionRef,
    editingColumnId, editColumnName, setEditColumnName,
    commitColumnNameEdit, cancelColumnNameEdit, handleColumnDoubleClick,
    editingCell, editValue, editError, selectEditValue, setEditValue,
    commitEdit, handleContextMenu, openContextMenu,
    autofillDragging, autofillEndRow, autofillPreview, autofillColumnId,
    handleAutofillStart, handleAutofillMove, handleAutofillOneRow,
    filters, handleToggleFilters, resizingColumn, handleResizeStart,
    resizeColumnBy, setColumnWidth,
    highlightedCells, handleAddRow, handleCellDoubleClick,
    contextMenu,
    getRowAtIndex,
    closeContextMenu,
    onInsertRowAbove: handleInsertRowAbove,
    onInsertRowBelow: handleInsertRowBelow,
    onDeleteRow: handleDeleteRow,
    onInsertColumnLeft: handleInsertColumnLeft,
    onInsertColumnRight: handleInsertColumnRight,
    onInsertRowAtBeginning: () => { doInsertRow(0); setContextMenu(null) },
    onInsertColumnAtBeginning: () => { openNewColumnModal(0); setContextMenu(null) },
    onToggleCellHighlight: toggleCellHighlight,
    onCreateChart: (colId: string) => { setChartPreselectedColumn(colId); setChartBuilderOpen(true) },
    onEditFormulaColumn: formulaLifecycle.openEditor,
    onDeleteFormulaColumn: formulaLifecycle.deleteColumn,
  }), [
    tableId, isEditable, canEdit, columns, getDisplayValue, getColumnWidth,
    selection, selectedCell, selectedColumn, isHeaderRowSelected,
    isIndexColumnSelected, isCornerSelected, cellRangeSelection,
    setSelection, handleCellMouseDown, handleCellMouseEnter,
    handleColumnClick, handleRowClick, handleCornerClick,
    toggleHighlightForSelection, isDraggingSelectionRef,
    editingColumnId, editColumnName, setEditColumnName,
    commitColumnNameEdit, cancelColumnNameEdit, handleColumnDoubleClick,
    editingCell, editValue, editError, selectEditValue, setEditValue,
    commitEdit, handleContextMenu, openContextMenu,
    autofillDragging, autofillEndRow, autofillPreview, autofillColumnId,
    handleAutofillStart, handleAutofillMove, handleAutofillOneRow,
    filters, handleToggleFilters, resizingColumn, handleResizeStart,
    resizeColumnBy, setColumnWidth,
    highlightedCells, handleAddRow, handleCellDoubleClick,
    contextMenu, getRowAtIndex, setContextMenu,
    handleInsertRowAbove, handleInsertRowBelow, handleDeleteRow,
    handleInsertColumnLeft, handleInsertColumnRight,
    doInsertRow, openNewColumnModal,
    toggleCellHighlight, setChartPreselectedColumn,
    closeContextMenu, formulaLifecycle.openEditor, formulaLifecycle.deleteColumn,
  ])

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-secondary">Table not found</p>
      </div>
    )
  }

  const displayError = materializationError || computationError || windowed.error
  if (displayError) {
    const presentation = describeEngineError(displayError, node.kind)
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
          <span className="text-sm text-text-secondary">{node.name}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md p-8">
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {presentation.title}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {presentation.description}
            </p>
            <details className="group rounded-lg bg-error-light p-3 text-left">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-error-text [&::-webkit-details-marker]:hidden">
                Show raw error
                <svg
                  className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <code className="mt-2 block max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-error-text">{displayError}</code>
            </details>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button type="button" onClick={handleRetry} className="btn btn-primary">
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isInitialLoad) {
    return (
      <div className="flex flex-col h-full" aria-busy="true">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
          <span className="text-sm text-text-secondary">{node.name}</span>
          <div className="flex-1" />
          <span className="badge badge-accent animate-pulse">{node.kind === 'derived_table' ? 'Computing...' : 'Loading...'}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-6" role="status" aria-live="polite">
            <div className="w-16 h-16 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-accent-green/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-accent-green border-t-transparent" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">{node.kind === 'derived_table' ? 'Computing Table' : 'Loading Table'}</h3>
            <p className="text-sm text-text-secondary">
              {node.kind === 'derived_table' ? 'Executing transform and loading data...' : 'Loading table data...'}
            </p>
            {loadingElapsedSeconds >= 8 && (
              <>
                <p className="text-sm text-text-secondary mt-2">
                  This is taking longer than expected. Your table and edits are still safe.
                </p>
                <div className="mt-5 flex items-center justify-center">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRetry}
                  >
                    Retry
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <GridProvider value={contextValue}>
      <div className="flex flex-col h-full">
        <GridToolbar
          totalRows={totalRows} unfilteredTotalRows={unfilteredTotalRows} columnCount={columns.length}
          isDirty={isDirty}
          isComputing={isComputing}
          showFilterPanel={showFilterPanel} showSuggestions={showSuggestions}
          rowInsertionDescription={getRowInsertionDescription()} columnInsertionDescription={getColumnInsertionDescription()}
          onAddColumn={handleAddColumn}
          onToggleSuggestions={() => setShowSuggestions(prev => !prev)}
          onOpenChartBuilder={() => { setChartPreselectedColumn(undefined); setChartBuilderOpen(true) }}
          onClearHighlights={clearHighlights}
        />

        {totalRows === 0 && !windowed.isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-secondary flex items-center justify-center">
                <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Empty Table</h3>
              <p className="text-sm text-text-secondary mb-4">
                This table has no data yet. {isEditable && 'Click "Add Row" to start entering data.'}
              </p>
              {isEditable && (
                <button
                  onClick={handleAddRow}
                  disabled={!canEdit}
                  title={canEdit ? undefined : EDITING_ELSEWHERE_TOOLTIP}
                  className="btn btn-primary"
                >
                  Add First Row
                </button>
              )}
            </div>
          </div>
        )}

        <GridViewport totalRows={totalRows} windowed={windowed} onAddColumn={handleAddColumn} />

        <GridContextMenu />
        {gridFeedback && <GridFeedback feedback={gridFeedback} onDismiss={() => setGridFeedback(null)} />}

        {showSuggestions && (
          <Suspense fallback={<div className="fixed right-0 top-0 h-full w-full max-w-96 animate-pulse border-l border-border bg-surface" />}>
            <SuggestionsPanel isOpen={showSuggestions} onClose={() => setShowSuggestions(false)} tableId={tableId} selectedColumnId={selectedColumn ?? undefined} />
          </Suspense>
        )}

        <FilterPanel tableId={tableId} isOpen={showFilterPanel} onClose={() => {
          setShowFilterPanel(false)
          setFilterTargetColumnId(undefined)
        }} columns={columns} filters={filters}
          onFiltersChange={handleFiltersChange} rows={loadedRows} getDisplayValue={getDisplayValue}
          matchingRowCount={totalRows} totalRowCount={unfilteredTotalRows}
          initialColumnId={filterTargetColumnId}
        />

        <FormulaColumnModal isOpen={newColumnModal.isOpen} columns={columns} onConfirm={(name, type, formula) => { doInsertColumn(newColumnModal.insertIndex, name, type, formula); setNewColumnModal({ isOpen: false, insertIndex: 0 }) }} onCancel={() => setNewColumnModal({ isOpen: false, insertIndex: 0 })} />
        <FormulaColumnModal isOpen={Boolean(formulaLifecycle.editingColumn)} columns={columns} initialColumn={formulaLifecycle.editingColumn} onConfirm={formulaLifecycle.saveFormula} onCancel={formulaLifecycle.closeEditor} />

        {chartBuilderOpen && (
          <Suspense fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-surface rounded-xl p-6 shadow-2xl border border-border-elevation flex items-center gap-3">
                <LoadingSpinner size="sm" className="text-accent-green" />
                <span className="text-sm font-medium text-text-secondary">Loading...</span>
              </div>
            </div>
          }>
            <ChartBuilder isOpen={chartBuilderOpen} onClose={() => { setChartBuilderOpen(false); setChartPreselectedColumn(undefined) }}
              sourceTableId={tableId} preselectedColumn={chartPreselectedColumn}
            />
          </Suspense>
        )}
        <DerivedTableEditDialog isOpen={derivedEditDialogOpen} tableId={tableId} onClose={() => setDerivedEditDialogOpen(false)} />
      </div>
    </GridProvider>
  )
}
