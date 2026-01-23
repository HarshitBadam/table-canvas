/**
 * UniversalBlock Component
 * 
 * A unified editable block that transforms based on content.
 * Notion-like editing experience with:
 * - Real-time markdown detection (# for headings, --- for divider)
 * - Slash commands (/ to open menu)
 * - Seamless type transformations
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ReportBlock, HeadingLevel } from '../types';

export interface TransformResult {
  type: 'text' | 'heading' | 'divider';
  level?: HeadingLevel;
  content?: string;
}

interface UniversalBlockProps {
  block: ReportBlock;
  reportId: string;
  isActive: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onContentChange: (content: string) => void;
  onTransform: (transform: TransformResult) => void;
  onSlashCommand: (position: { x: number; y: number }, filterText: string) => void;
  onSlashClose: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEnterKey: () => void;
}

// Detect markdown patterns
function detectTransformation(text: string): TransformResult | null {
  // Check for heading patterns at start
  const headingMatch = text.match(/^(#{1,3})\s(.*)$/);
  if (headingMatch) {
    return {
      type: 'heading',
      level: headingMatch[1].length as HeadingLevel,
      content: headingMatch[2],
    };
  }
  
  // Check for divider
  if (text === '---' || text === '***' || text === '___') {
    return { type: 'divider' };
  }
  
  return null;
}

// Get content from any block type
function getBlockContent(block: ReportBlock): string {
  switch (block.type) {
    case 'text':
      return block.content;
    case 'heading':
      return block.content;
    default:
      return '';
  }
}

// Get placeholder based on block type
function getPlaceholder(block: ReportBlock): string {
  switch (block.type) {
    case 'heading':
      return `Heading ${block.level}`;
    default:
      return "Type '/' for commands...";
  }
}

export function UniversalBlock({
  block,
  isActive,
  onFocus,
  onBlur,
  onContentChange,
  onTransform,
  onSlashCommand,
  onSlashClose,
  onDelete,
  onMoveUp,
  onMoveDown,
  onEnterKey,
}: UniversalBlockProps) {
  const [content, setContent] = useState(getBlockContent(block));
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSlashPos = useRef<number | null>(null);

  // Sync content when block changes externally
  useEffect(() => {
    if (!isActive) {
      setContent(getBlockContent(block));
    }
  }, [block, isActive]);

  // Focus textarea when becoming active
  useEffect(() => {
    if (isActive && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isActive]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 24)}px`;
    }
  }, [content]);

  // Handle input changes
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    setContent(value);
    onContentChange(value);
    
    // Check for slash command
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash !== -1 && cursorPos > lastSlash) {
      const textAfterSlash = value.substring(lastSlash + 1, cursorPos);
      // Only open menu if slash is at start of word
      const charBeforeSlash = lastSlash > 0 ? value[lastSlash - 1] : ' ';
      
      if (charBeforeSlash === ' ' || charBeforeSlash === '\n' || lastSlash === 0) {
        if (!slashMenuOpen) {
          setSlashMenuOpen(true);
          lastSlashPos.current = lastSlash;
          
          // Calculate position
          if (textareaRef.current) {
            const rect = textareaRef.current.getBoundingClientRect();
            // Rough calculation - can be improved with caret position library
            onSlashCommand({ x: rect.left + 20, y: rect.bottom + 4 }, textAfterSlash);
          }
        }
      }
    } else if (slashMenuOpen) {
      setSlashMenuOpen(false);
      onSlashClose();
      lastSlashPos.current = null;
    }
    
    // Check for real-time transformations
    // Only trigger on space after markdown syntax
    if (value.endsWith(' ')) {
      const transformation = detectTransformation(value.trim());
      if (transformation) {
        onTransform(transformation);
        setContent('');
        return;
      }
    }
  }, [onContentChange, onSlashCommand, onSlashClose, slashMenuOpen, onTransform]);

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // If slash menu is open, let it handle navigation
    if (slashMenuOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        onSlashClose();
        lastSlashPos.current = null;
        return;
      }
      // Arrow keys and Enter are handled by SlashCommandMenu
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
        return; // Let the menu handle it
      }
    }
    
    // Check for transformations on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      const transformation = detectTransformation(content.trim());
      if (transformation) {
        e.preventDefault();
        onTransform(transformation);
        setContent('');
        return;
      }
      
      // If just pressing Enter on empty line or end of content, create new block
      if (content.trim() === '' || textareaRef.current?.selectionStart === content.length) {
        e.preventDefault();
        onEnterKey();
        return;
      }
    }
    
    // Delete empty block with Backspace
    if (e.key === 'Backspace' && content === '') {
      e.preventDefault();
      onDelete();
      return;
    }
    
    // Move block up/down with Cmd+Shift+Arrow
    if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onMoveUp();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onMoveDown();
        return;
      }
    }
  }, [content, slashMenuOpen, onSlashClose, onTransform, onDelete, onMoveUp, onMoveDown, onEnterKey]);

  // Handle blur
  const handleBlur = useCallback(() => {
    if (slashMenuOpen) {
      // Don't blur if menu is open (user might be clicking on it)
      return;
    }
    onBlur();
  }, [slashMenuOpen, onBlur]);

  // Get styles based on block type
  const textStyles = useMemo(() => {
    switch (block.type) {
      case 'heading':
        switch (block.level) {
          case 1:
            return 'text-3xl font-bold';
          case 2:
            return 'text-2xl font-semibold';
          case 3:
            return 'text-xl font-medium';
          default:
            return 'text-base';
        }
      default:
        return 'text-base leading-relaxed';
    }
  }, [block]);

  const placeholder = getPlaceholder(block);

  // Non-editable blocks (divider, chart, table) are rendered differently
  if (block.type === 'divider' || block.type === 'chart' || block.type === 'table_snippet' || block.type === 'table_inline' || block.type === 'table_blank') {
    return null; // These are handled by specific block components
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`w-full min-h-[1.5em] resize-none bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 ${textStyles}`}
        rows={1}
      />
    </div>
  );
}

export default UniversalBlock;
