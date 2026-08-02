import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectNode, TableNode } from '@/types'
import { useProjectStore } from '@/state/projectStore'
import { continuePendingSourceDuplicate } from '@/state/continuePendingSourceDuplicate'
import { duplicateDerivedTable } from '@/state/duplicateDerivedTable'
import { useAppAuth } from '@/state/AppContext'
import {
  isTableUpdating,
  isTableWaiting,
  useNodeCacheInfo,
} from '@/state/tableRuntimeStore'
import { EDITING_ELSEWHERE_TOOLTIP, useWorkspaceLease } from '@/state/useWorkspaceLease'
import { focusMenuItem } from '@/lib/focusMenuItem'
import { ChartTypeIcon } from '@/charts/ChartTypeIcon'
import { TableTypeIcon } from '@/components/TableTypeIcon'
import { UpgradePrompt } from '@/components/UpgradePrompt'
import { DuplicateTableErrorDialog } from '@/components/DuplicateTableErrorDialog'
import { checkTableCount, type LimitExceeded } from '@/shared/enforce'
import { beginTableOperation } from '@/state/tableOperationCoordinator'

interface SidebarNodeItemProps {
  node: ProjectNode
  selected: boolean
  onOpen: (nodeId: string) => void
  onDelete: (nodeId: string, returnFocus?: HTMLElement | null) => void
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
  const saveSnapshot = useProjectStore(state => state.saveSnapshot)
  const nodes = useProjectStore(state => state.nodes)
  const { user } = useAppAuth()
  const { canEdit } = useWorkspaceLease()
  const cacheInfo = useNodeCacheInfo(node.id)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(node.name)
  const [upgradeViolation, setUpgradeViolation] = useState<LimitExceeded | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState(false)
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
      saveSnapshot(`Rename node ${node.name}`)
      updateNode(node.id, { name: nextName })
    }
    setRenaming(false)
  }

  const duplicate = async () => {
    setMenuPosition(null)
    if (node.kind === 'source_table' || node.kind === 'derived_table') {
      const currentTableCount = Object.values(nodes).filter(
        candidate => candidate.kind === 'source_table' || candidate.kind === 'derived_table',
      ).length
      const capacity = checkTableCount(currentTableCount, user?.tier ?? 'guest')
      if (!capacity.ok) {
        setUpgradeViolation(capacity)
        setUpgradeOpen(true)
        return
      }
    }

    if (node.kind === 'derived_table') {
      if (duplicating) return
      setDuplicating(true)
      const result = await duplicateDerivedTable(
        node.id,
        user?.tier ?? 'guest',
        { selectDuplicate: false },
      )
      setDuplicating(false)
      if (!result.ok) {
        if (result.code === 'LIMIT_EXCEEDED') {
          setUpgradeViolation(result.violation)
          setUpgradeOpen(true)
        } else {
          setDuplicateError(result.error)
        }
        return
      }
      return
    }

    const duplicateId = duplicateNode(node.id, { selectDuplicate: false })
    if (
      duplicateId
      && node.kind === 'source_table'
      && isTableWaiting(cacheInfo)
    ) {
      const generation = beginTableOperation(duplicateId, 'waiting')
      void continuePendingSourceDuplicate(node.id, duplicateId, generation)
    }
  }

  const isTable = node.kind === 'source_table' || node.kind === 'derived_table'
  const isDerivedTable = node.kind === 'derived_table'
  const tableIsUpdating = isTable && isTableUpdating(cacheInfo)

  return (
    <li
      className={`group flex min-h-14 items-center rounded-lg transition-colors ${
        selected
          ? isDerivedTable ? 'sidebar-node-active-derived' : 'sidebar-node-active'
          : 'hover:bg-surface-secondary'
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
            aria-busy={tableIsUpdating || undefined}
            aria-current={selected ? 'page' : undefined}
            title={tableIsUpdating ? 'This table is still loading; you can open it now.' : undefined}
            className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset ${
              isDerivedTable ? 'focus-visible:ring-node-derived-border' : 'focus-visible:ring-accent-green'
            } ${
              selected
                ? isDerivedTable ? 'text-node-derived-border' : 'text-node-source-border'
                : 'text-text-primary'
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
            className={`sidebar-node-action mr-1 flex h-8 w-8 shrink-0 items-center justify-center text-text-tertiary outline-none transition-[opacity,color] focus:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-green group-hover:opacity-100 group-focus-within:opacity-100 ${
              selected
                ? isDerivedTable ? 'hover:text-node-derived-border' : 'hover:text-node-source-border'
                : 'hover:text-text-primary'
            } ${
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
          <MenuItem icon={<RenameIcon />} label="Rename" onClick={startRename} disabled={!canEdit} />
          <MenuItem
            icon={<DuplicateIcon />}
            label={duplicating ? 'Duplicating…' : 'Duplicate'}
            onClick={() => void duplicate()}
            disabled={!canEdit || duplicating}
          />
          <MenuItem
            icon={<DeleteIcon />}
            label="Delete"
            destructive
            disabled={!canEdit}
            onClick={() => {
              setMenuPosition(null)
              onDelete(node.id, triggerRef.current)
            }}
          />
        </div>,
        document.body,
      )}
      <UpgradePrompt
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        violation={upgradeViolation}
      />
      <DuplicateTableErrorDialog
        error={duplicateError}
        onClose={() => setDuplicateError(null)}
      />
    </li>
  )
}

function TableDimensions({ node, selected }: { node: TableNode; selected: boolean }) {
  const cacheInfo = useNodeCacheInfo(node.id)
  if (!node.schema) return null
  const columns = node.schema.columns.length
  const rows = cacheInfo?.lastRowCount ?? node.schema.rowCount ?? 0
  return (
    <span className={`mt-0.5 text-xs tabular-nums ${
      selected
        ? node.kind === 'derived_table' ? 'text-node-derived-border' : 'text-node-source-border'
        : 'text-text-tertiary'
    }`}>
      {rows.toLocaleString()} rows <span className="ml-1">{columns.toLocaleString()} columns</span>
    </span>
  )
}

function NodeIcon({ node }: { node: ProjectNode }) {
  if (node.kind === 'chart') {
    return (
      <span className="sidebar-node-icon sidebar-node-icon-chart flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-node-chart text-node-chart-border transition-colors">
        <ChartTypeIcon type={node.plan.chartType} className="h-4 w-4" />
      </span>
    )
  }
  const source = node.kind === 'source_table'
  return (
    <span className={`sidebar-node-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
      source
        ? 'sidebar-node-icon-source bg-node-source text-node-source-border'
        : 'sidebar-node-icon-derived bg-node-derived text-node-derived-border'
    }`}>
      <TableTypeIcon className="h-4 w-4" />
    </span>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
  disabled = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? EDITING_ELSEWHERE_TOOLTIP : undefined}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset disabled:opacity-40 disabled:hover:bg-transparent ${
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
