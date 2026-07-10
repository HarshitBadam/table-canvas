import { memo } from 'react'

export interface ContextMenuState {
  show: boolean
  x: number
  y: number
  type: 'row' | 'column' | 'cell'
  index: number
  colIndex?: number
}

interface TableContextMenuProps {
  menu: ContextMenuState | null
  menuRef: React.RefObject<HTMLDivElement>
  headers: string[]
  rows: unknown[][]
  onAddRow: (atIndex?: number) => void
  onAddColumn: (atIndex?: number) => void
  onDeleteRow: (index: number) => void
  onDeleteColumn: (index: number) => void
}

export const TableContextMenu = memo(function TableContextMenu({
  menu,
  menuRef,
  headers,
  rows,
  onAddRow,
  onAddColumn,
  onDeleteRow,
  onDeleteColumn,
}: TableContextMenuProps) {
  if (!menu) return null

  return (
    <div
      ref={menuRef}
      className="table-context-menu"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.type === 'column' && (
        <>
          <button onClick={() => onAddColumn(menu.index)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Insert column left
          </button>
          <button onClick={() => onAddColumn(menu.index + 1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Insert column right
          </button>
          {headers.length > 1 && (
            <button onClick={() => onDeleteColumn(menu.index)} className="danger">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete column
            </button>
          )}
        </>
      )}
      {menu.type === 'cell' && (
        <>
          <button onClick={() => onAddRow(menu.index)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Insert row above
          </button>
          <button onClick={() => onAddRow(menu.index + 1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Insert row below
          </button>
          {rows.length > 1 && (
            <button onClick={() => onDeleteRow(menu.index)} className="danger">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete row
            </button>
          )}
          <div className="context-menu-divider" />
          {menu.colIndex !== undefined && headers.length > 1 && (
            <button onClick={() => onDeleteColumn(menu.colIndex!)} className="danger">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete column
            </button>
          )}
        </>
      )}
    </div>
  )
})
