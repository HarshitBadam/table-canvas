/**
 * BlockRenderer Component
 * 
 * Renders the appropriate block component based on block type.
 * Clean, minimal Notion-like design.
 */

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
  isHovered: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onOpenTable?: (tableId: string) => void;
}

export function BlockRenderer({
  block,
  reportId,
  isSelected,
  isHovered,
  onSelect,
  onDelete,
  onDuplicate,
  onKeyDown,
  onOpenTable,
}: BlockRendererProps) {
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
        return <DividerBlock />;
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
      className={`relative rounded-md transition-colors duration-100 ${
        isSelected 
          ? 'bg-blue-50 dark:bg-blue-900/20' 
          : isHovered 
            ? 'bg-gray-50 dark:bg-gray-800/30' 
            : ''
      }`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* Block actions menu - top right, visible on hover/select */}
      {(isHovered || isSelected) && block.type !== 'divider' && (
        <div className="absolute -top-2 right-2 flex items-center gap-1 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-md px-1 py-0.5 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Duplicate (⌘D)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
            title="Delete (⌘⌫)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}

      {/* Block content */}
      <div className="py-1">
        {renderBlockContent()}
      </div>
    </div>
  );
}

export default BlockRenderer;
