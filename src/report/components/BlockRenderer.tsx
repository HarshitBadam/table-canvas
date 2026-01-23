/**
 * BlockRenderer Component
 * 
 * Renders the appropriate block component based on block type.
 * Clean, minimal Excel-like design with keyboard support.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ReportBlock } from '../types';
import { TextBlock } from './blocks/TextBlock';
import { HeadingBlock } from './blocks/HeadingBlock';
import { ChartBlock } from './blocks/ChartBlock';
import { TableSnippetBlock } from './blocks/TableSnippetBlock';
import { InlineTableBlock } from './blocks/InlineTableBlock';
import { BlankTableBlock } from './blocks/BlankTableBlock';
import { DividerBlock } from './blocks/DividerBlock';

interface BlockRendererProps {
  block: ReportBlock;
  reportId: string;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onOpenTable?: (tableId: string) => void;
}

export function BlockRenderer({
  block,
  reportId,
  isSelected,
  onSelect,
  onDelete,
  onKeyDown,
  onOpenTable,
}: BlockRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus container when selected (so it can receive keyboard events)
  useEffect(() => {
    if (isSelected && containerRef.current) {
      containerRef.current.focus();
    }
  }, [isSelected]);

  // Handle keyboard events for non-text blocks
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Backspace or Delete - delete the block
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onDelete();
      return;
    }
    
    // Pass to parent handler for navigation etc
    onKeyDown(e);
  }, [onDelete, onKeyDown]);

  const renderBlockContent = () => {
    switch (block.type) {
      case 'text':
        return (
          <TextBlock
            block={block}
            reportId={reportId}
            isSelected={isSelected}
          />
        );
      case 'heading':
        return (
          <HeadingBlock
            block={block}
            reportId={reportId}
            isSelected={isSelected}
          />
        );
      case 'chart':
        return (
          <ChartBlock
            block={block}
            reportId={reportId}
            isSelected={isSelected}
            onOpenTable={onOpenTable}
          />
        );
      case 'table_snippet':
        return (
          <TableSnippetBlock
            block={block}
            reportId={reportId}
            isSelected={isSelected}
            onOpenTable={onOpenTable}
          />
        );
      case 'table_inline':
        return (
          <InlineTableBlock
            block={block}
            reportId={reportId}
            isSelected={isSelected}
          />
        );
      case 'table_blank':
        return (
          <BlankTableBlock
            block={block}
            reportId={reportId}
            isSelected={isSelected}
          />
        );
      case 'divider':
        return <DividerBlock isSelected={isSelected} />;
      default:
        return (
          <div className="py-2 px-3 text-gray-400 text-sm italic">
            Unknown block type
          </div>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {renderBlockContent()}
    </div>
  );
}

export default BlockRenderer;
