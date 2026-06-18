import { useState, useCallback, useRef, useEffect, lazy, Suspense, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useProjectStore } from '@/state/projectStore'
import { FilterPanel } from './FilterPanel'
import { FormulaColumnModal } from './FormulaColumnModal'
import type { FormulaValue } from '@/formula'
import { ensureTableMaterialized } from '@/engine/materializationService'
import { ColumnHeader } from './ColumnHeader'
import { GridCell } from './GridCell'
import { GridContextMenu } from './GridContextMenu'
import { GridToolbar } from './GridToolbar'
import { ROW_HEIGHT, HEADER_HEIGHT } from './constants'
import { useColumnResize } from './useColumnResize'
import { useGridData } from './useGridData'
import { useGridSelection } from './useGridSelection'
import { useGridClipboard } from './useGridClipboard'
import { useGridKeyboard } from './useGridKeyboard'
import { useGridAutofill } from './useGridAutofill'
import { useGridEditing } from './useGridEditing'
import { useGridOperations } from './useGridOperations'
import { GridProvider, type GridContextValue } from './GridContext'

const SuggestionsPanel = lazy(() => import('@/suggestions/SuggestionsPanel').then(m => ({ default: m.SuggestionsPanel })))
const ChartBuilder = lazy(() => import('@/charts/ChartBuilder').then(m => ({ default: m.ChartBuilder })))

interface GridViewProps {
  tableId: string
}

export function GridView({ tableId }: GridViewProps) {
  const toggleCellHighlight = useProjectStore((state) => state.toggleCellHighlight)
  const clearHighlights = useProjectStore((state) => state.clearHighlights)

  const {
    node, columns, rows, filteredRows, unfilteredTotalRows,
    isEditable, isDirty, isComputing, isMaterializing,
    materializationError, setMaterializationError, computationError,
    highlightedCells, tableData, getDisplayValue,
    filters, handleFiltersChange,
    windowed,
  } = useGridData(tableId)

  const {
    editingCell, editValue, editError, setEditValue,
    startEditing, commitEdit, cancelEdit, handleCellDoubleClick,
    editingColumnId, editColumnName, setEditColumnName,
    handleColumnDoubleClick, commitColumnNameEdit, cancelColumnNameEdit,
    saveSnapshot, setCellValue,
  } = useGridEditing(tableId, columns, rows, isEditable)

  const {
    selection, setSelection,
    selectedCell, selectedColumn, isHeaderRowSelected, isIndexColumnSelected, isCornerSelected,
    cellRangeSelection, isDraggingSelectionRef,
    handleCellMouseDown, handleCellMouseEnter,
    handleColumnClick, handleRowClick, handleCornerClick,
    getRowInsertionIndex, getColumnInsertionIndex,
    getRowInsertionDescription, getColumnInsertionDescription,
    toggleHighlightForSelection,
  } = useGridSelection(tableId, columns, rows, filteredRows, isEditable)

  const {
    contextMenu, setContextMenu, newColumnModal, setNewColumnModal,
    doInsertRow, openNewColumnModal, doInsertColumn, handleContextMenu,
    handleInsertRowAbove, handleInsertRowBelow, handleDeleteRow,
    handleInsertColumnLeft, handleInsertColumnRight,
  } = useGridOperations(tableId, columns, rows, isEditable, saveSnapshot)

  const {
    autofillDragging, autofillEndRow, autofillPreview, autofillColumnId,
    handleAutofillStart, handleAutofillMove,
  } = useGridAutofill({
    isEditable, columns, rows, selection, cellRangeSelection,
    getDisplayValue, saveSnapshot, setCellValue, tableId,
  })

  const { getSelectedCellData, formatClipboardText } = useGridClipboard(
    tableId, node, columns, filteredRows, getDisplayValue, selection, cellRangeSelection,
  )

  useGridKeyboard({
    editingCell, selectedCell, selection, columns, rows, isEditable,
    cellRangeSelection, setSelection, commitEdit, cancelEdit, startEditing,
    getDisplayValue, saveSnapshot, setCellValue, tableId,
    getSelectedCellData, formatClipboardText,
  })

  const { getColumnWidth, handleResizeStart, resizingColumn } = useColumnResize()

  const containerRef = useRef<HTMLDivElement>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [chartBuilderOpen, setChartBuilderOpen] = useState(false)
  const [chartPreselectedColumn, setChartPreselectedColumn] = useState<string | undefined>(undefined)

  const totalRows = filteredRows.length

  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  })

  useEffect(() => {
    if (!contextMenu) return
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [contextMenu, setContextMenu])

  const handleAddRow = useCallback(() => doInsertRow(getRowInsertionIndex()), [getRowInsertionIndex, doInsertRow])
  const handleAddColumn = useCallback(() => openNewColumnModal(getColumnInsertionIndex()), [getColumnInsertionIndex, openNewColumnModal])
  const handleToggleFilters = useCallback(() => setShowFilterPanel(prev => !prev), [])

  const contextValue: GridContextValue = useMemo(() => ({
    tableId, isEditable, columns, getDisplayValue, getColumnWidth,
    selection, selectedCell, selectedColumn, isHeaderRowSelected,
    isIndexColumnSelected, isCornerSelected, cellRangeSelection,
    handleCellMouseDown, handleCellMouseEnter,
    handleColumnClick, handleRowClick, handleCornerClick,
    toggleHighlightForSelection, isDraggingSelectionRef,
    editingColumnId, editColumnName, setEditColumnName,
    commitColumnNameEdit, cancelColumnNameEdit, handleColumnDoubleClick,
    editingCell, editValue, editError, setEditValue,
    startEditing, commitEdit, cancelEdit, handleContextMenu,
    autofillDragging, autofillEndRow, autofillPreview, autofillColumnId,
    handleAutofillStart, handleAutofillMove,
    filters, handleToggleFilters, resizingColumn, handleResizeStart,
    highlightedCells, handleAddRow, handleCellDoubleClick,
    contextMenu,
    filteredRows,
    closeContextMenu: () => setContextMenu(null),
    onInsertRowAbove: handleInsertRowAbove,
    onInsertRowBelow: handleInsertRowBelow,
    onDeleteRow: handleDeleteRow,
    onInsertColumnLeft: handleInsertColumnLeft,
    onInsertColumnRight: handleInsertColumnRight,
    onInsertRowAtBeginning: () => { doInsertRow(0); setContextMenu(null) },
    onInsertColumnAtBeginning: () => { openNewColumnModal(0); setContextMenu(null) },
    onToggleCellHighlight: toggleCellHighlight,
    onCreateChart: (colId: string) => { setChartPreselectedColumn(colId); setChartBuilderOpen(true) },
  }), [
    tableId, isEditable, columns, getDisplayValue, getColumnWidth,
    selection, selectedCell, selectedColumn, isHeaderRowSelected,
    isIndexColumnSelected, isCornerSelected, cellRangeSelection,
    handleCellMouseDown, handleCellMouseEnter,
    handleColumnClick, handleRowClick, handleCornerClick,
    toggleHighlightForSelection, isDraggingSelectionRef,
    editingColumnId, editColumnName, setEditColumnName,
    commitColumnNameEdit, cancelColumnNameEdit, handleColumnDoubleClick,
    editingCell, editValue, editError, setEditValue,
    startEditing, commitEdit, cancelEdit, handleContextMenu,
    autofillDragging, autofillEndRow, autofillPreview, autofillColumnId,
    handleAutofillStart, handleAutofillMove,
    filters, handleToggleFilters, resizingColumn, handleResizeStart,
    highlightedCells, handleAddRow, handleCellDoubleClick,
    contextMenu, filteredRows, setContextMenu,
    handleInsertRowAbove, handleInsertRowBelow, handleDeleteRow,
    handleInsertColumnLeft, handleInsertColumnRight,
    doInsertRow, openNewColumnModal,
    toggleCellHighlight, setChartPreselectedColumn,
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
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
          <span className="text-sm text-text-secondary">{node.name}</span>
          <div className="flex-1" />
          <span className="badge badge-red">Error</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md p-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {node.kind === 'derived_table' ? 'Computation Error' : 'Data Loading Error'}
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              {node.kind === 'derived_table' ? 'Failed to compute this derived table:' : 'Failed to load this table:'}
            </p>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-left">
              <code className="text-xs text-red-700 dark:text-red-300 break-all">{displayError}</code>
            </div>
            <button onClick={() => { setMaterializationError(null); ensureTableMaterialized(tableId).then(() => windowed.invalidate()) }} className="mt-4 btn btn-primary">
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if ((isMaterializing || isComputing) && totalRows === 0 && !tableData?.rows?.length) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
          <span className="text-sm text-text-secondary">{node.name}</span>
          <div className="flex-1" />
          <span className="badge badge-blue animate-pulse">{node.kind === 'derived_table' ? 'Computing...' : 'Loading...'}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-green-200 dark:border-green-800" />
              <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">{node.kind === 'derived_table' ? 'Computing Table' : 'Loading Table'}</h3>
            <p className="text-sm text-text-secondary">{node.kind === 'derived_table' ? 'Executing transform and loading data...' : 'Loading table data...'}</p>
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
          isMaterializing={isMaterializing} isComputing={isComputing}
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
              {isEditable && <button onClick={handleAddRow} className="btn btn-primary">Add First Row</button>}
            </div>
          </div>
        )}

        {(totalRows > 0 || windowed.isLoading) && (
          <div ref={containerRef} className="flex-1 overflow-auto select-none">
            <div style={{
              height: rowVirtualizer.getTotalSize() + HEADER_HEIGHT,
              position: 'relative',
              minWidth: 50 + columns.reduce((sum, col) => sum + getColumnWidth(col.id), 0) + (isEditable ? 40 : 0),
            }}>
              <div className="sticky top-0 z-20 flex border-b border-border table-header-bg" style={{ height: HEADER_HEIGHT }}>
                <div
                  onClick={handleCornerClick} onContextMenu={(e) => handleContextMenu(e, 'corner')}
                  className={`sticky left-0 z-30 flex items-center justify-center px-3 text-xs font-medium border-r border-border cursor-pointer table-header-bg ${
                    isCornerSelected ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 ring-2 ring-inset ring-green-500' : 'text-text-tertiary hover:bg-surface-tertiary'
                  }`}
                  style={{ width: 50, minWidth: 50 }} title="Click to insert row/column at beginning"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </div>
                {columns.map((col) => <ColumnHeader key={col.id} column={col} />)}
                {isEditable && (
                  <div onClick={() => openNewColumnModal(columns.length)}
                    className="flex items-center justify-center px-2 text-xs cursor-pointer border-l border-border text-text-tertiary hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400"
                    style={{ width: 40, minWidth: 40 }} title="Add column"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                )}
              </div>

              <div style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const actualIndex = virtualRow.index
                  const row = filteredRows[actualIndex]
                  if (!row) {
                    return (
                      <div
                        key={`skeleton-${actualIndex}`}
                        className="flex border-b border-border-subtle bg-surface animate-pulse"
                        style={{
                          position: 'absolute',
                          top: virtualRow.start,
                          height: ROW_HEIGHT,
                          width: '100%',
                        }}
                      >
                        <div className="sticky left-0 z-10 flex items-center justify-center px-3 text-xs border-r border-border-subtle text-text-tertiary bg-surface" style={{ width: 50, minWidth: 50 }}>
                          {actualIndex + 1}
                        </div>
                        {columns.map((col) => (
                          <div key={col.id} className="flex items-center px-3" style={{ width: getColumnWidth(col.id) }}>
                            <div className="h-4 bg-surface-secondary rounded w-3/4" />
                          </div>
                        ))}
                      </div>
                    )
                  }

                  const isRowSelected = selection?.type === 'row' && selection.rowIndex === actualIndex
                  return (
                    <div
                      key={row.__rowId}
                      className={`flex border-b border-border-subtle ${actualIndex % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary/50'} ${isRowSelected || isIndexColumnSelected ? 'bg-accent-green/10' : ''}`}
                      style={{
                        position: 'absolute',
                        top: virtualRow.start,
                        height: ROW_HEIGHT,
                        width: '100%',
                      }}
                    >
                      <div onClick={() => handleRowClick(actualIndex)} onContextMenu={(e) => handleContextMenu(e, 'row', actualIndex)}
                        className={`sticky left-0 z-10 flex items-center justify-center px-3 text-xs border-r border-border-subtle cursor-pointer ${
                          isRowSelected ? 'text-accent-green font-medium !bg-accent-green/15 ring-2 ring-inset ring-accent-green'
                            : isIndexColumnSelected ? 'text-accent-green !bg-accent-green/10' : 'text-text-tertiary hover:bg-surface-secondary'
                        } ${actualIndex % 2 !== 0 ? 'bg-surface-secondary' : 'bg-surface'}`}
                        style={{ width: 50, minWidth: 50 }} title={`Row ${actualIndex + 1}`}
                      >{actualIndex + 1}</div>
                      {columns.map((col) => <GridCell key={col.id} column={col} row={row} rowIndex={actualIndex} />)}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <GridContextMenu />

        {showSuggestions && (
          <Suspense fallback={<div className="fixed right-0 top-0 w-96 h-full bg-surface border-l border-border animate-pulse" />}>
            <SuggestionsPanel isOpen={showSuggestions} onClose={() => setShowSuggestions(false)} tableId={tableId} selectedColumnId={selectedColumn ?? undefined} />
          </Suspense>
        )}

        <FilterPanel isOpen={showFilterPanel} onClose={() => setShowFilterPanel(false)} columns={columns} filters={filters}
          onFiltersChange={handleFiltersChange} rows={rows} getDisplayValue={getDisplayValue}
          matchingRowCount={totalRows} totalRowCount={unfilteredTotalRows}
        />

        <FormulaColumnModal isOpen={newColumnModal.isOpen} insertIndex={newColumnModal.insertIndex} columns={columns}
          rows={rows.map(row => {
            const rowData: Record<string, FormulaValue> = {}
            columns.forEach(col => { rowData[col.id] = getDisplayValue(row.__rowId, col.id, row[col.id], row) as FormulaValue })
            return rowData
          })}
          onConfirm={(name, type, formula) => { doInsertColumn(newColumnModal.insertIndex, name, type, formula); setNewColumnModal({ isOpen: false, insertIndex: 0 }) }}
          onCancel={() => setNewColumnModal({ isOpen: false, insertIndex: 0 })}
        />

        {chartBuilderOpen && (
          <Suspense fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)' }}>
              <div className="bg-white dark:bg-[#1f1f1f] rounded-2xl p-6 shadow-2xl flex items-center gap-3" style={{ boxShadow: '0 24px 48px rgba(0, 0, 0, 0.15)' }}>
                <LoadingSpinner size="sm" className="text-[#217346]" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Loading...</span>
              </div>
            </div>
          }>
            <ChartBuilder isOpen={chartBuilderOpen} onClose={() => { setChartBuilderOpen(false); setChartPreselectedColumn(undefined) }}
              sourceTableId={tableId} preselectedColumn={chartPreselectedColumn}
            />
          </Suspense>
        )}
      </div>
    </GridProvider>
  )
}
