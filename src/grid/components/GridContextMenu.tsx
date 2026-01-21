/**
 * GridContextMenu Component
 * 
 * Context menu for grid operations (insert row/column, delete, highlight, etc.)
 */

import { memo } from 'react';
import { clsx } from '@/lib/utils';

export type ContextMenuType = 'cell' | 'row' | 'column' | 'header' | 'index' | 'corner';

export interface ContextMenuState {
  x: number;
  y: number;
  type: ContextMenuType;
  rowIndex?: number;
  columnId?: string;
}

export interface GridContextMenuProps {
  menu: ContextMenuState;
  isEditable: boolean;
  isCellHighlighted: boolean;
  hasRangeSelection: boolean;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onDeleteRow: () => void;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onToggleHighlight: () => void;
  onCreateChart: () => void;
  onClose: () => void;
}

export const GridContextMenu = memo(function GridContextMenu({
  menu,
  isEditable,
  isCellHighlighted,
  hasRangeSelection,
  onInsertRowAbove,
  onInsertRowBelow,
  onDeleteRow,
  onInsertColumnLeft,
  onInsertColumnRight,
  onToggleHighlight,
  onCreateChart,
  onClose,
}: GridContextMenuProps) {
  if (!isEditable) return null;

  return (
    <div
      className="fixed bg-surface rounded-lg shadow-xl border border-border py-1 z-50 min-w-[180px]"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Row operations */}
      {(menu.type === 'cell' || menu.type === 'row') && (
        <>
          <MenuButton onClick={onInsertRowAbove} icon={<ArrowUpIcon />}>
            Insert Row Above
          </MenuButton>
          <MenuButton onClick={onInsertRowBelow} icon={<ArrowDownIcon />}>
            Insert Row Below
          </MenuButton>
          <MenuDivider />
          <MenuButton onClick={onDeleteRow} icon={<TrashIcon />} variant="danger">
            Delete Row
          </MenuButton>
        </>
      )}

      {/* Highlight cell option - only for cells */}
      {menu.type === 'cell' && menu.rowIndex !== undefined && menu.columnId && (
        <>
          <MenuDivider />
          <MenuButton
            onClick={onToggleHighlight}
            icon={isCellHighlighted ? <XIcon /> : <HighlightIcon />}
            variant={isCellHighlighted ? 'default' : 'highlight'}
          >
            {hasRangeSelection
              ? 'Toggle Highlight (Ctrl+H)'
              : isCellHighlighted
              ? 'Remove Highlight'
              : 'Highlight Cell'}
          </MenuButton>
        </>
      )}

      {/* Header context menu */}
      {menu.type === 'header' && (
        <MenuButton onClick={onInsertRowAbove} icon={<PlusIcon />}>
          Insert Row at Beginning
        </MenuButton>
      )}

      {/* Corner context menu */}
      {menu.type === 'corner' && (
        <>
          <MenuButton onClick={onInsertRowAbove} icon={<PlusIcon />}>
            Insert Row at Beginning
          </MenuButton>
          <MenuButton onClick={onInsertColumnLeft} icon={<PlusIcon />}>
            Insert Column at Beginning
          </MenuButton>
        </>
      )}

      {/* Index column context menu */}
      {menu.type === 'index' && (
        <MenuButton onClick={onInsertColumnLeft} icon={<PlusIcon />}>
          Insert Column at Beginning
        </MenuButton>
      )}

      {/* Column operations */}
      {(menu.type === 'cell' || menu.type === 'column') && menu.columnId && (
        <>
          {menu.type === 'cell' && <MenuDivider />}
          <MenuButton onClick={onInsertColumnLeft} icon={<ArrowLeftIcon />}>
            Insert Column Left
          </MenuButton>
          <MenuButton onClick={onInsertColumnRight} icon={<ArrowRightIcon />}>
            Insert Column Right
          </MenuButton>
          <MenuDivider />
          <MenuButton onClick={onCreateChart} icon={<ChartIcon />}>
            Create Chart
          </MenuButton>
        </>
      )}
    </div>
  );
});

// Menu button component
interface MenuButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: 'default' | 'danger' | 'highlight';
}

function MenuButton({ onClick, icon, children, variant = 'default' }: MenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full px-3 py-2 text-sm text-left flex items-center gap-2',
        variant === 'default' && 'hover:bg-surface-secondary text-text-primary',
        variant === 'danger' && 'hover:bg-red-50 text-red-600 dark:hover:bg-red-900/30',
        variant === 'highlight' && 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
      )}
    >
      <span className={clsx('w-4 h-4', variant === 'default' && 'text-text-tertiary')}>
        {icon}
      </span>
      {children}
    </button>
  );
}

function MenuDivider() {
  return <div className="border-t border-border my-1" />;
}

// Icons
function ArrowUpIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function HighlightIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
