import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectNode, TableNode } from '@/types'
import { useProjectStore } from '@/state/projectStore'
import { focusMenuItem } from '@/lib/focusMenuItem'

interface SidebarNodeItemProps {
  node: ProjectNode
  selected: boolean
  onOpen: (nodeId: string) => void
  onDelete: (nodeId: string) => void
}

interface MenuPosition {
  left: number
  top: number
}

export function SidebarNodeItem({
  node,
  selected,
  onOpen,
  onDelete,
}: SidebarNodeItemProps) {
  const updateNode = useProjectStore(state => state.updateNode)
  const duplicateNode = useProjectStore(state => state.duplicateNode)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.name)
  const menuOpen = menuPosition !== null

  useEffect(() => {
    if (!menuOpen) return
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    firstItem?.focus()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setMenuPosition(null)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuPosition(null)
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
    const closeMenu = () => setMenuPosition(null)

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [menuOpen])

  const openMenu = () => {
    if (menuOpen) {
      setMenuPosition(null)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 176
    const estimatedHeight = 132
    const gutter = 8
    const top = rect.bottom + estimatedHeight + gutter <= window.innerHeight
      ? rect.bottom + 4
      : rect.top - estimatedHeight - 4
    setMenuPosition({
      left: Math.max(gutter, Math.min(rect.right - width, window.innerWidth - width - gutter)),
      top: Math.max(gutter, top),
    })
  }

  const startRename = () => {
    setMenuPosition(null)
    setName(node.name)
    setRenaming(true)
  }

  const commitRename = () => {
    const nextName = name.trim()
    if (nextName && nextName !== node.name) {
      updateNode(node.id, { name: nextName })
    }
    setRenaming(false)
  }

  const duplicate = () => {
    setMenuPosition(null)
    const duplicateId = duplicateNode(node.id)
    if (duplicateId) onOpen(duplicateId)
  }

  const isTable = node.kind === 'source_table' || node.kind === 'derived_table'

  return (
    <li
      className={`group flex min-h-14 items-center rounded-lg transition-colors ${
        selected ? 'bg-accent-green/10' : 'hover:bg-surface-secondary'
      }`}
    >
      {renaming ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2"
          onSubmit={event => {
            event.preventDefault()
            commitRename()
          }}
        >
          <NodeIcon node={node} />
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            onFocus={event => event.currentTarget.select()}
            onBlur={commitRename}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setName(node.name)
                setRenaming(false)
              }
            }}
            maxLength={100}
            autoFocus
            aria-label={`Rename ${node.name}`}
            className="input h-9 min-w-0 flex-1 px-2.5 text-sm"
          />
        </form>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onOpen(node.id)}
            aria-current={selected ? 'page' : undefined}
            className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-green ${
              selected ? 'text-accent-green' : 'text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <NodeIcon node={node} />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium">{node.name}</span>
                {isTable && <TableDimensions node={node as TableNode} selected={selected} />}
              </div>
            </div>
          </button>
          <button
            ref={triggerRef}
            type="button"
            onClick={openMenu}
            aria-label={`Actions for ${node.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`sidebar-node-action mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary outline-none transition-[opacity,color,background-color] hover:bg-surface-tertiary hover:text-text-primary focus:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-green group-hover:opacity-100 group-focus-within:opacity-100 ${
              selected || menuOpen ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <circle cx="4" cy="10" r="1.25" />
              <circle cx="10" cy="10" r="1.25" />
              <circle cx="16" cy="10" r="1.25" />
            </svg>
          </button>
        </>
      )}

      {menuOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${node.name}`}
          style={{ left: menuPosition.left, top: menuPosition.top, width: 176 }}
          onKeyDown={event => focusMenuItem(event, menuRef.current)}
          className="fixed z-popover overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg motion-safe:animate-scale-in"
        >
          <MenuItem icon={<RenameIcon />} label="Rename" onClick={startRename} />
          <MenuItem icon={<DuplicateIcon />} label="Duplicate" onClick={duplicate} />
          <div className="my-1 border-t border-border-subtle" />
          <MenuItem
            icon={<DeleteIcon />}
            label="Delete"
            destructive
            onClick={() => {
              setMenuPosition(null)
              onDelete(node.id)
            }}
          />
        </div>,
        document.body,
      )}
    </li>
  )
}

function TableDimensions({ node, selected }: { node: TableNode; selected: boolean }) {
  if (!node.schema) return null
  const columns = node.schema.columns.length
  const rows = node.cacheInfo?.lastRowCount ?? node.schema.rowCount ?? 0
  return (
    <span className={`mt-0.5 flex gap-3 text-xs tabular-nums ${
      selected ? 'text-accent-text' : 'text-text-tertiary'
    }`}>
      <span>{columns.toLocaleString()} columns</span>
      <span>{rows.toLocaleString()} rows</span>
    </span>
  )
}

function NodeIcon({ node }: { node: ProjectNode }) {
  if (node.kind === 'chart') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-node-chart text-node-chart-border">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 19V9m7 10V5m7 14v-7" />
        </svg>
      </span>
    )
  }
  const source = node.kind === 'source_table'
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
      source ? 'bg-node-source text-node-source-border' : 'bg-node-derived text-node-derived-border'
    }`}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path strokeLinecap="round" d="M4 9h16M9 9v11" />
      </svg>
    </span>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset ${
        destructive
          ? 'text-error-text hover:bg-error/10 focus-visible:ring-error'
          : 'text-text-primary hover:bg-surface-secondary focus-visible:ring-accent-green'
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center text-current">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function RenameIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12.5 4.5l3 3M4 16l.75-3 8.5-8.5a1.4 1.4 0 012 2L6.75 15 4 16z" />
    </svg>
  )
}

function DuplicateIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
      <path strokeLinecap="round" d="M13.5 6.5V5A1.5 1.5 0 0012 3.5H5A1.5 1.5 0 003.5 5v7A1.5 1.5 0 005 13.5h1.5" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 6.5h9m-6-2h3m-5 2 .5 9h6l.5-9" />
    </svg>
  )
}
