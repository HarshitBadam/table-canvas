/**
 * TextBlock Component
 * 
 * Notion-like text block with clean, minimal design.
 * Supports basic markdown formatting and shortcuts:
 * - Type `---` for divider
 * - Type `# ` for H1, `## ` for H2, `### ` for H3
 */

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { useReportStore } from '../../reportStore';
import type { TextBlock as TextBlockType, NewBlock } from '../../types';

interface TextBlockProps {
  block: TextBlockType;
  reportId: string;
  isSelected: boolean;
}

export const TextBlock = memo(function TextBlock({ block, reportId, isSelected }: TextBlockProps) {
  const updateBlock = useReportStore((state) => state.updateBlock);
  const deleteBlock = useReportStore((state) => state.deleteBlock);
  const addBlock = useReportStore((state) => state.addBlock);
  
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(block.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get current block index for inserting new blocks
  const getBlockIndex = useCallback(() => {
    const report = useReportStore.getState().reports[reportId];
    return report?.blocks.findIndex(b => b.id === block.id) ?? -1;
  }, [reportId, block.id]);

  // Sync content when block changes externally
  useEffect(() => {
    if (!isEditing) {
      setContent(block.content);
    }
  }, [block.content, isEditing]);

  // Auto-focus when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content, isEditing]);

  // Start editing on click or when selected with empty content
  useEffect(() => {
    if (isSelected && block.content === '') {
      setIsEditing(true);
    }
  }, [isSelected, block.content]);

  const handleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  // Check for markdown shortcuts and convert block
  const checkMarkdownShortcuts = useCallback((text: string): boolean => {
    const blockIndex = getBlockIndex();
    if (blockIndex === -1) return false;

    // Divider: ---
    if (text.trim() === '---' || text.trim() === '***' || text.trim() === '___') {
      // Replace this text block with a divider
      deleteBlock(reportId, block.id);
      const newBlock: NewBlock = { type: 'divider' };
      addBlock(reportId, newBlock, blockIndex);
      // Add a new text block after the divider
      const textBlock: NewBlock = { type: 'text', content: '' };
      addBlock(reportId, textBlock, blockIndex + 1);
      return true;
    }

    // Headings: # ## ###
    const headingMatch = text.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const headingContent = headingMatch[2];
      
      // Replace this text block with a heading
      deleteBlock(reportId, block.id);
      const newBlock: NewBlock = { 
        type: 'heading', 
        level, 
        content: headingContent 
      };
      addBlock(reportId, newBlock, blockIndex);
      return true;
    }

    return false;
  }, [reportId, block.id, deleteBlock, addBlock, getBlockIndex]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    
    // Check for markdown shortcuts
    if (checkMarkdownShortcuts(content)) {
      return;
    }
    
    if (content !== block.content) {
      updateBlock(reportId, block.id, { content });
    }
  }, [content, block.content, block.id, reportId, updateBlock, checkMarkdownShortcuts]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setContent(block.content);
      setIsEditing(false);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Check for shortcuts on Enter
      const trimmed = content.trim();
      
      // Divider shortcut
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        e.preventDefault();
        checkMarkdownShortcuts(content);
        return;
      }
      
      // Heading shortcuts
      if (trimmed.match(/^#{1,3}\s+/)) {
        e.preventDefault();
        checkMarkdownShortcuts(content);
        return;
      }
    }
  }, [block.content, content, checkMarkdownShortcuts]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setContent(newValue);
    
    // Real-time check for shortcuts (on space after shortcut)
    if (newValue.endsWith(' ')) {
      const trimmed = newValue.trim();
      
      // Check for heading shortcuts in real-time
      if (trimmed.match(/^#{1,3}$/)) {
        // User just typed "# " or "## " or "### "
        // Don't convert yet, wait for more content or Enter
      }
    }
  }, []);

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full min-h-[1.5em] resize-none bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 text-base leading-relaxed placeholder:text-gray-400 dark:placeholder:text-gray-500"
        placeholder="Type '/' for commands, '---' for divider, '# ' for heading..."
        rows={1}
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`min-h-[1.5em] cursor-text leading-relaxed ${
        content ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
      }`}
    >
      {content ? (
        <div className="prose prose-gray dark:prose-invert max-w-none prose-p:my-0">
          {content.split('\n').map((line, i) => (
            <p key={i} className="mb-1 last:mb-0">
              {renderInlineMarkdown(line) || <br />}
            </p>
          ))}
        </div>
      ) : (
        <span>Type '/' for commands, '---' for divider, '# ' for heading...</span>
      )}
    </div>
  );
});

// Simple inline markdown renderer
function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={key++} className="font-semibold">{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Code: `text`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // No match - take one character
    parts.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  return parts.length > 0 ? parts : text;
}

export default TextBlock;
