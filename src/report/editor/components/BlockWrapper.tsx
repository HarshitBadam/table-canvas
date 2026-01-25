/**
 * BlockWrapper - Wrapper component for block selection states
 * 
 * Provides consistent selection, hover, and drag states for all blocks.
 */

import { memo, ReactNode } from 'react';

interface BlockWrapperProps {
  children: ReactNode;
  isSelected?: boolean;
  isDragging?: boolean;
  className?: string;
}

export const BlockWrapper = memo(function BlockWrapper({
  children,
  isSelected = false,
  isDragging = false,
  className = '',
}: BlockWrapperProps) {
  const stateClasses = [
    'tiptap-block-wrapper',
    isSelected && 'is-selected',
    isDragging && 'is-dragging',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={stateClasses}>
      {children}
    </div>
  );
});

export default BlockWrapper;
