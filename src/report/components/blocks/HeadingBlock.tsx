/**
 * HeadingBlock Component
 * 
 * Notion-like heading block with clean typography.
 * Supports H1, H2, H3 levels.
 */

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useReportStore } from '../../reportStore';
import type { HeadingBlock as HeadingBlockType } from '../../types';

interface HeadingBlockProps {
  block: HeadingBlockType;
  reportId: string;
  isSelected: boolean;
}

const headingStyles = {
  1: 'text-3xl font-bold',
  2: 'text-2xl font-semibold',
  3: 'text-xl font-medium',
};

const placeholders = {
  1: 'Heading 1',
  2: 'Heading 2',
  3: 'Heading 3',
};

export const HeadingBlock = memo(function HeadingBlock({ block, reportId, isSelected }: HeadingBlockProps) {
  const updateBlock = useReportStore((state) => state.updateBlock);
  
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(block.content);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync content when block changes externally
  useEffect(() => {
    if (!isEditing) {
      setContent(block.content);
    }
  }, [block.content, isEditing]);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Start editing when selected with empty content
  useEffect(() => {
    if (isSelected && block.content === '') {
      setIsEditing(true);
    }
  }, [isSelected, block.content]);

  const handleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (content !== block.content) {
      updateBlock(reportId, block.id, { content });
    }
  }, [content, block.content, block.id, reportId, updateBlock]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setContent(block.content);
      setIsEditing(false);
    }
  }, [block.content]);

  const style = headingStyles[block.level] || headingStyles[1];
  const placeholder = placeholders[block.level] || placeholders[1];

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 ${style}`}
        placeholder={placeholder}
      />
    );
  }

  const HeadingTag = `h${block.level}` as 'h1' | 'h2' | 'h3';

  return (
    <HeadingTag
      onClick={handleClick}
      className={`cursor-text ${style} ${
        content ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
      }`}
    >
      {content || placeholder}
    </HeadingTag>
  );
});

export default HeadingBlock;
