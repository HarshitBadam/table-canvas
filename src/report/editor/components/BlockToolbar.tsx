/**
 * BlockToolbar - Floating toolbar for block actions
 * 
 * Shows on hover/select with drag handle and action buttons.
 */

import { memo, useCallback } from 'react';

interface BlockToolbarProps {
  onDragStart?: () => void;
  onAddAbove?: () => void;
  onAddBelow?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  position?: 'left' | 'top';
}

export const BlockToolbar = memo(function BlockToolbar({
  onDragStart,
  onAddAbove,
  onAddBelow,
  onDuplicate,
  onDelete,
  position = 'left',
}: BlockToolbarProps) {
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.();
  }, [onDragStart]);

  if (position === 'left') {
    return (
      <div className="block-toolbar">
        {/* Drag Handle */}
        <button
          className="block-toolbar-button drag-handle"
          draggable
          onDragStart={handleDragStart}
          title="Drag to reorder"
        >
          <DragHandleIcon />
        </button>

        {/* Add Block */}
        <button
          className="block-toolbar-button"
          onClick={onAddBelow}
          title="Add block below"
        >
          <PlusIcon />
        </button>
      </div>
    );
  }

  // Top position - horizontal toolbar
  return (
    <div className="block-toolbar-top">
      <button
        className="block-toolbar-button drag-handle"
        draggable
        onDragStart={handleDragStart}
        title="Drag to reorder"
      >
        <DragHandleIcon />
      </button>

      <div className="block-toolbar-divider" />

      <button
        className="block-toolbar-button"
        onClick={onAddAbove}
        title="Add block above"
      >
        <PlusIcon />
      </button>

      <button
        className="block-toolbar-button"
        onClick={onDuplicate}
        title="Duplicate"
      >
        <DuplicateIcon />
      </button>

      <button
        className="block-toolbar-button"
        onClick={onDelete}
        title="Delete"
      >
        <TrashIcon />
      </button>
    </div>
  );
});

// ============================================================================
// Icons
// ============================================================================

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="10" cy="3" r="1.5" />
      <circle cx="4" cy="7" r="1.5" />
      <circle cx="10" cy="7" r="1.5" />
      <circle cx="4" cy="11" r="1.5" />
      <circle cx="10" cy="11" r="1.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="7" y1="3" x2="7" y2="11" />
      <line x1="3" y1="7" x2="11" y2="7" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <path d="M2 10V3a1 1 0 011-1h7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4" />
      <path d="M3 4l1 8.5a.5.5 0 00.5.5h5a.5.5 0 00.5-.5L11 4" />
    </svg>
  );
}

export default BlockToolbar;
