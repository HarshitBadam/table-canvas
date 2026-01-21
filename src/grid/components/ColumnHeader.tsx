/**
 * ColumnHeader Component
 * 
 * Column header cell with sorting, filtering, and resize capabilities.
 */

import { memo, useRef, useEffect } from 'react';
import { ColumnSchema } from '@/lib/types';
import { clsx } from '@/lib/utils';
import { GRID } from '@/design/tokens';

export interface ColumnHeaderProps {
  column: ColumnSchema;
  width: number;
  isSelected: boolean;
  isHeaderRowSelected: boolean;
  isEditing: boolean;
  editValue: string;
  isEditable: boolean;
  isResizing: boolean;
  isFiltered: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onEditChange: (value: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onFilterClick: () => void;
}

export const ColumnHeader = memo(function ColumnHeader({
  column,
  width,
  isSelected,
  isHeaderRowSelected,
  isEditing,
  editValue,
  isEditable,
  isResizing,
  isFiltered,
  onClick,
  onDoubleClick,
  onContextMenu,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onResizeStart,
  onFilterClick,
}: ColumnHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Handle keyboard events for editing
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEditCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onEditCancel();
    }
  };

  // Determine background based on selection state
  const isHighlighted = isSelected || isHeaderRowSelected;
  const bgClass = isResizing
    ? 'bg-green-200 dark:bg-green-800/50'
    : isHighlighted
    ? 'bg-green-100 dark:bg-green-900/40'
    : '';

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={clsx(
        'relative flex items-center gap-1 px-2 text-xs font-medium cursor-pointer select-none',
        'border-r border-border group text-green-700 dark:text-green-400',
        bgClass
      )}
      style={{ width, minWidth: width, maxWidth: width, height: GRID.headerHeight }}
      title={isEditable ? `"${column.name}" - Double-click to rename, drag edge to resize` : `"${column.name}"`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditCommit}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 w-full h-full px-2 text-xs font-medium bg-transparent outline-none border-none text-text-primary"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="truncate flex-1 min-w-0">{column.name}</span>
          
          {/* Formula indicator */}
          {column.isComputed && (
            <span
              className="px-1 py-0.5 text-[9px] font-mono bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded flex-shrink-0"
              title={`Formula: ${column.formula}`}
            >
              fx
            </span>
          )}
          
          {/* Filter indicator */}
          {isFiltered && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFilterClick();
              }}
              className="p-0.5 text-green-500 hover:text-green-600 flex-shrink-0"
              title={`Column "${column.name}" is filtered`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
          )}
          
          {/* Type badge */}
          <span className="text-[10px] font-mono text-text-tertiary uppercase flex-shrink-0">
            {column.type}
          </span>
        </>
      )}
      
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-green-500/50 transition-colors z-10"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
});
