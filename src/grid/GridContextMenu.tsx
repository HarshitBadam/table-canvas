export type { ContextMenuState } from './types'
import { useGridContext } from './GridContext'

export function GridContextMenu() {
  const {
    contextMenu,
    filteredRows,
    cellRangeSelection,
    highlightedCells,
    onInsertRowAbove,
    onInsertRowBelow,
    onDeleteRow,
    onInsertColumnLeft,
    onInsertColumnRight,
    onInsertRowAtBeginning,
    onInsertColumnAtBeginning,
    toggleHighlightForSelection,
    onToggleCellHighlight,
    onCreateChart,
    closeContextMenu,
    tableId,
  } = useGridContext()

  if (!contextMenu) return null

  return (
    <div 
      className="fixed bg-surface rounded-lg shadow-xl border border-border py-1 z-50 min-w-[180px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {(contextMenu.type === 'cell' || contextMenu.type === 'row') && (
        <>
          <button
            onClick={onInsertRowAbove}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            Insert Row Above
          </button>
          <button
            onClick={onInsertRowBelow}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Insert Row Below
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={onDeleteRow}
            className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Row
          </button>
        </>
      )}
      
      {contextMenu.type === 'cell' && contextMenu.rowIndex !== undefined && contextMenu.columnId && (
        <>
          <div className="border-t border-border my-1" />
          {(() => {
            const row = filteredRows[contextMenu.rowIndex!]
            const cellKey = row ? `${row.__rowId}:${contextMenu.columnId}` : ''
            const isCurrentlyHighlighted = highlightedCells?.has(cellKey) ?? false
            return (
              <button
                onClick={() => {
                  if (cellRangeSelection) {
                    toggleHighlightForSelection()
                  } else if (row) {
                    onToggleCellHighlight(tableId, row.__rowId, contextMenu.columnId!)
                  }
                  closeContextMenu()
                }}
                className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 ${
                  isCurrentlyHighlighted 
                    ? 'hover:bg-surface-secondary text-text-secondary' 
                    : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isCurrentlyHighlighted ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  )}
                </svg>
                {cellRangeSelection 
                  ? 'Toggle Highlight (Ctrl+H)' 
                  : isCurrentlyHighlighted ? 'Remove Highlight' : 'Highlight Cell'
                }
              </button>
            )
          })()}
        </>
      )}
      
      {contextMenu.type === 'header' && (
        <>
          <button
            onClick={onInsertRowAtBeginning}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Insert Row at Beginning
          </button>
        </>
      )}
      
      {contextMenu.type === 'corner' && (
        <>
          <button
            onClick={onInsertRowAtBeginning}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Insert Row at Beginning
          </button>
          <button
            onClick={onInsertColumnAtBeginning}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Insert Column at Beginning
          </button>
        </>
      )}
      
      {contextMenu.type === 'index' && (
        <>
          <button
            onClick={onInsertColumnAtBeginning}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Insert Column at Beginning
          </button>
        </>
      )}
      
      {(contextMenu.type === 'cell' || contextMenu.type === 'column') && contextMenu.columnId && (
        <>
          {contextMenu.type === 'cell' && <div className="border-t border-border my-1" />}
          <button
            onClick={onInsertColumnLeft}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Insert Column Left
          </button>
          <button
            onClick={onInsertColumnRight}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            Insert Column Right
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => {
              onCreateChart(contextMenu.columnId!)
              closeContextMenu()
            }}
            className="w-full px-3 py-2 text-sm text-left hover:bg-surface-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Create Chart
          </button>
        </>
      )}
    </div>
  )
}
