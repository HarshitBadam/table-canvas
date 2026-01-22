/**
 * BlockEditor Component
 * 
 * Notion-like block editor with clean, minimal design.
 * Features:
 * - Real-time markdown detection and block transformation
 * - Slash commands for inserting blocks (/)
 * - Hover to reveal controls
 * - Drag and drop reordering
 * - Keyboard shortcuts
 * - Paste from grid (Cmd+V)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useReportStore } from '../reportStore';
import { BlockRenderer } from './BlockRenderer';
import { SlashCommandMenu } from './SlashCommandMenu';
import type { ReportBlock, NewBlock, BlockType, HeadingLevel } from '../types';
import type { GridClipboardData } from '@/types/clipboard.types';

interface BlockEditorProps {
  reportId: string;
  blocks: ReportBlock[];
  onOpenTable?: (tableId: string) => void;
}

export function BlockEditor({ reportId, blocks, onOpenTable }: BlockEditorProps) {
  const addBlock = useReportStore((state) => state.addBlock);
  const updateBlock = useReportStore((state) => state.updateBlock);
  const deleteBlock = useReportStore((state) => state.deleteBlock);
  const reorderBlocks = useReportStore((state) => state.reorderBlocks);
  const duplicateBlock = useReportStore((state) => state.duplicateBlock);
  const transformBlock = useReportStore((state) => state.transformBlock);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Slash command menu state
  const [slashMenu, setSlashMenu] = useState<{
    position: { x: number; y: number };
    filterText: string;
    blockId: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle adding a new block
  const handleAddBlock = useCallback((blockData: NewBlock, index?: number) => {
    const newBlockId = addBlock(reportId, blockData, index);
    if (newBlockId) {
      setSelectedBlockId(newBlockId);
      setActiveBlockId(newBlockId);
    }
    return newBlockId;
  }, [reportId, addBlock]);

  // Handle block selection
  const handleBlockSelect = useCallback((blockId: string) => {
    setSelectedBlockId(blockId);
  }, []);

  // Handle block activation (focus for editing)
  const handleBlockActivate = useCallback((blockId: string) => {
    setActiveBlockId(blockId);
    setSelectedBlockId(blockId);
  }, []);

  // Handle block deactivation (blur)
  const handleBlockDeactivate = useCallback(() => {
    setActiveBlockId(null);
  }, []);

  // Handle block deletion
  const handleBlockDelete = useCallback((blockId: string) => {
    const blockIndex = blocks.findIndex(b => b.id === blockId);
    deleteBlock(reportId, blockId);
    
    // Focus previous block if exists
    if (blockIndex > 0) {
      const prevBlock = blocks[blockIndex - 1];
      setSelectedBlockId(prevBlock.id);
      setActiveBlockId(prevBlock.id);
    } else if (blocks.length > 1) {
      // Focus next block
      const nextBlock = blocks[blockIndex + 1];
      if (nextBlock) {
        setSelectedBlockId(nextBlock.id);
        setActiveBlockId(nextBlock.id);
      }
    } else {
      setSelectedBlockId(null);
      setActiveBlockId(null);
    }
  }, [reportId, deleteBlock, blocks]);

  // Handle block duplication
  const handleBlockDuplicate = useCallback((blockId: string) => {
    const newBlockId = duplicateBlock(reportId, blockId);
    if (newBlockId) {
      setSelectedBlockId(newBlockId);
    }
  }, [reportId, duplicateBlock]);

  // Handle block transformation (e.g., text -> heading)
  const handleBlockTransform = useCallback((blockId: string, newType: BlockType, newProps: Record<string, unknown> = {}) => {
    transformBlock(reportId, blockId, newType, newProps);
  }, [reportId, transformBlock]);

  // Handle content change for text/heading blocks
  const handleContentChange = useCallback((blockId: string, content: string) => {
    updateBlock(reportId, blockId, { content });
  }, [reportId, updateBlock]);

  // Handle Enter key - create new block below
  const handleEnterKey = useCallback((blockId: string) => {
    const blockIndex = blocks.findIndex(b => b.id === blockId);
    const newBlockId = handleAddBlock({ type: 'text', content: '' }, blockIndex + 1);
    if (newBlockId) {
      // Give time for the new block to render, then focus it
      setTimeout(() => {
        setActiveBlockId(newBlockId);
      }, 0);
    }
  }, [blocks, handleAddBlock]);

  // Handle moving block up
  const handleMoveUp = useCallback((blockId: string) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index > 0) {
      reorderBlocks(reportId, index, index - 1);
    }
  }, [blocks, reportId, reorderBlocks]);

  // Handle moving block down
  const handleMoveDown = useCallback((blockId: string) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index < blocks.length - 1) {
      reorderBlocks(reportId, index, index + 1);
    }
  }, [blocks, reportId, reorderBlocks]);

  // Handle slash command menu open
  const handleSlashCommand = useCallback((blockId: string, position: { x: number; y: number }, filterText: string) => {
    setSlashMenu({ position, filterText, blockId });
  }, []);

  // Handle slash command menu close
  const handleSlashClose = useCallback(() => {
    setSlashMenu(null);
  }, []);

  // Handle slash command selection
  const handleSlashSelect = useCallback((commandKey: string, tableId?: string) => {
    if (!slashMenu) return;
    
    const blockIndex = blocks.findIndex(b => b.id === slashMenu.blockId);
    let newBlock: NewBlock | null = null;
    
    switch (commandKey) {
      case 'text':
        // Just clear the slash and keep typing
        handleContentChange(slashMenu.blockId, '');
        break;
      case 'h1':
        handleBlockTransform(slashMenu.blockId, 'heading', { level: 1 as HeadingLevel, content: '' });
        break;
      case 'h2':
        handleBlockTransform(slashMenu.blockId, 'heading', { level: 2 as HeadingLevel, content: '' });
        break;
      case 'h3':
        handleBlockTransform(slashMenu.blockId, 'heading', { level: 3 as HeadingLevel, content: '' });
        break;
      case 'divider':
        // Replace current block with divider and add new text block
        handleBlockTransform(slashMenu.blockId, 'divider', {});
        handleAddBlock({ type: 'text', content: '' }, blockIndex + 1);
        break;
      case 'table':
        newBlock = {
          type: 'table_blank',
          rowCount: 3,
          columnCount: 3,
          data: {
            headers: ['Column 1', 'Column 2', 'Column 3'],
            rows: [['', '', ''], ['', '', ''], ['', '', '']],
          },
        };
        break;
      case 'chart':
        if (tableId) {
          newBlock = {
            type: 'chart',
            sourceTableId: tableId,
            chartType: 'bar',
            config: { showLegend: true, showGrid: true },
          };
        }
        break;
      case 'embed':
        if (tableId) {
          newBlock = {
            type: 'table_snippet',
            sourceTableId: tableId,
            selectedColumns: [],
            rowSelectionMode: 'first_n',
            rowLimit: 10,
            displayMode: 'embedded',
          };
        }
        break;
    }
    
    if (newBlock) {
      // Delete the current text block and add the new block
      deleteBlock(reportId, slashMenu.blockId);
      handleAddBlock(newBlock, blockIndex);
    }
    
    setSlashMenu(null);
  }, [slashMenu, blocks, handleContentChange, handleBlockTransform, handleAddBlock, deleteBlock, reportId]);

  // Drag handlers
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  }, [draggedIndex]);

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      reorderBlocks(reportId, draggedIndex, dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [reportId, draggedIndex, dragOverIndex, reorderBlocks]);

  // Keyboard shortcuts for blocks
  const handleKeyDown = useCallback((e: React.KeyboardEvent, blockId: string, index: number) => {
    if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleBlockDelete(blockId);
    } else if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleBlockDuplicate(blockId);
    } else if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      handleMoveUp(blockId);
    } else if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      handleMoveDown(blockId);
    }
  }, [handleBlockDelete, handleBlockDuplicate, handleMoveUp, handleMoveDown]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedBlockId(null);
        setActiveBlockId(null);
        setSlashMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle paste from grid (Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Check if there's grid clipboard data
      const gridData = window.__gridClipboard as GridClipboardData | undefined;
      
      if (gridData && (Date.now() - gridData.timestamp < 60000)) { // Within 1 minute
        e.preventDefault();
        
        // Create an inline table block with the pasted data
        const block: NewBlock = {
          type: 'table_inline',
          data: {
            headers: gridData.headers,
            rows: gridData.rows,
          },
          sourceInfo: {
            tableId: gridData.sourceTableId,
            tableName: gridData.sourceTableName,
          },
          caption: `From ${gridData.sourceTableName}`,
        };
        
        // Insert at selected position or at end
        const insertIndex = selectedBlockId 
          ? blocks.findIndex(b => b.id === selectedBlockId) + 1 
          : blocks.length;
        
        handleAddBlock(block, insertIndex);
        
        // Clear the clipboard data after pasting
        window.__gridClipboard = undefined;
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [blocks, selectedBlockId, handleAddBlock]);

  // Handle click on placeholder to add new block
  const handlePlaceholderClick = useCallback(() => {
    const newBlockId = handleAddBlock({ type: 'text', content: '' }, blocks.length);
    if (newBlockId) {
      setTimeout(() => {
        setActiveBlockId(newBlockId);
      }, 0);
    }
  }, [handleAddBlock, blocks.length]);

  // Handle markdown transformation from text blocks
  const handleMarkdownTransform = useCallback((blockId: string, transform: { type: string; level?: number; content?: string }) => {
    if (transform.type === 'heading' && transform.level) {
      handleBlockTransform(blockId, 'heading', { 
        level: transform.level as HeadingLevel, 
        content: transform.content || '' 
      });
    } else if (transform.type === 'divider') {
      const blockIndex = blocks.findIndex(b => b.id === blockId);
      handleBlockTransform(blockId, 'divider', {});
      // Add new text block after divider
      handleAddBlock({ type: 'text', content: '' }, blockIndex + 1);
    }
  }, [blocks, handleBlockTransform, handleAddBlock]);

  return (
    <div ref={containerRef} className="relative min-h-[200px]">
      {blocks.length === 0 ? (
        <EmptyState onAddBlock={handlePlaceholderClick} />
      ) : (
        <div className="space-y-0.5">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className={`group relative ${dragOverIndex === index ? 'pt-1' : ''}`}
              onMouseEnter={() => setHoveredBlockId(block.id)}
              onMouseLeave={() => setHoveredBlockId(null)}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              {/* Drop indicator line */}
              {dragOverIndex === index && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent-green rounded-full" />
              )}

              {/* Block controls - left side */}
              <div 
                className={`absolute -left-12 top-1 flex items-center gap-0.5 transition-opacity duration-150 ${
                  hoveredBlockId === block.id || selectedBlockId === block.id ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {/* Add block button */}
                <button
                  onClick={() => {
                    const newBlockId = handleAddBlock({ type: 'text', content: '' }, index);
                    if (newBlockId) {
                      setTimeout(() => setActiveBlockId(newBlockId), 0);
                    }
                  }}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title="Add block"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                
                {/* Drag handle */}
                <button
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-grab active:cursor-grabbing transition-colors"
                  title="Drag to reorder"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
                  </svg>
                </button>
              </div>

              {/* Block content */}
              <div className={`${draggedIndex === index ? 'opacity-50' : ''}`}>
                <EditableBlockWrapper
                  block={block}
                  reportId={reportId}
                  isSelected={selectedBlockId === block.id}
                  isHovered={hoveredBlockId === block.id}
                  isActive={activeBlockId === block.id}
                  onSelect={() => handleBlockSelect(block.id)}
                  onActivate={() => handleBlockActivate(block.id)}
                  onDeactivate={handleBlockDeactivate}
                  onDelete={() => handleBlockDelete(block.id)}
                  onDuplicate={() => handleBlockDuplicate(block.id)}
                  onKeyDown={(e) => handleKeyDown(e, block.id, index)}
                  onOpenTable={onOpenTable}
                  onContentChange={(content) => handleContentChange(block.id, content)}
                  onTransform={(transform) => handleMarkdownTransform(block.id, transform)}
                  onSlashCommand={(pos, filter) => handleSlashCommand(block.id, pos, filter)}
                  onSlashClose={handleSlashClose}
                  onEnterKey={() => handleEnterKey(block.id)}
                  onMoveUp={() => handleMoveUp(block.id)}
                  onMoveDown={() => handleMoveDown(block.id)}
                />
              </div>
            </div>
          ))}

          {/* Placeholder for adding new block at end */}
          <div 
            className="group py-2"
            onMouseEnter={() => setHoveredBlockId('__end__')}
            onMouseLeave={() => setHoveredBlockId(null)}
          >
            <button
              onClick={handlePlaceholderClick}
              className={`flex items-center gap-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity duration-150 ${
                hoveredBlockId === '__end__' ? 'opacity-100' : 'opacity-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm">Type '/' for commands, or click to add a block</span>
            </button>
          </div>
        </div>
      )}

      {/* Slash Command Menu */}
      {slashMenu && (
        <SlashCommandMenu
          position={slashMenu.position}
          filterText={slashMenu.filterText}
          onSelect={handleSlashSelect}
          onClose={handleSlashClose}
        />
      )}
    </div>
  );
}

// Wrapper component that handles both editable and non-editable blocks
interface EditableBlockWrapperProps {
  block: ReportBlock;
  reportId: string;
  isSelected: boolean;
  isHovered: boolean;
  isActive: boolean;
  onSelect: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onOpenTable?: (tableId: string) => void;
  onContentChange: (content: string) => void;
  onTransform: (transform: { type: string; level?: number; content?: string }) => void;
  onSlashCommand: (position: { x: number; y: number }, filterText: string) => void;
  onSlashClose: () => void;
  onEnterKey: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function EditableBlockWrapper({
  block,
  reportId,
  isSelected,
  isHovered,
  isActive,
  onSelect,
  onActivate,
  onDeactivate,
  onDelete,
  onDuplicate,
  onKeyDown,
  onOpenTable,
  onContentChange,
  onTransform,
  onSlashCommand,
  onSlashClose,
  onEnterKey,
  onMoveUp,
  onMoveDown,
}: EditableBlockWrapperProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localContent, setLocalContent] = useState(
    (block.type === 'text' || block.type === 'heading') ? block.content : ''
  );
  const [slashFilterText, setSlashFilterText] = useState('');
  const lastSlashPos = useRef<number | null>(null);

  // Sync local content when block changes
  useEffect(() => {
    if (!isActive && (block.type === 'text' || block.type === 'heading')) {
      setLocalContent(block.content);
    }
  }, [block, isActive]);

  // Focus textarea when becoming active
  useEffect(() => {
    if (isActive && textareaRef.current && (block.type === 'text' || block.type === 'heading')) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isActive, block.type]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 24)}px`;
    }
  }, [localContent]);

  // Handle text input changes
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    setLocalContent(value);
    onContentChange(value);
    
    // Check for slash command
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash !== -1 && cursorPos > lastSlash) {
      const textAfterSlash = value.substring(lastSlash + 1, cursorPos);
      const charBeforeSlash = lastSlash > 0 ? value[lastSlash - 1] : ' ';
      
      if (charBeforeSlash === ' ' || charBeforeSlash === '\n' || lastSlash === 0) {
        if (lastSlashPos.current === null) {
          lastSlashPos.current = lastSlash;
          if (textareaRef.current) {
            const rect = textareaRef.current.getBoundingClientRect();
            onSlashCommand({ x: rect.left + 20, y: rect.bottom + 4 }, textAfterSlash);
          }
        }
        setSlashFilterText(textAfterSlash);
      }
    } else if (lastSlashPos.current !== null) {
      lastSlashPos.current = null;
      setSlashFilterText('');
      onSlashClose();
    }
    
    // Check for real-time transformations on space
    if (value.endsWith(' ')) {
      const trimmed = value.trim();
      
      // Heading patterns
      const headingMatch = trimmed.match(/^(#{1,3})$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        onTransform({ type: 'heading', level, content: '' });
        setLocalContent('');
        return;
      }
      
      // Divider
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        onTransform({ type: 'divider' });
        setLocalContent('');
        return;
      }
    }
  }, [onContentChange, onSlashCommand, onSlashClose, onTransform]);

  // Handle key events
  const handleTextKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Check for transformations on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      const trimmed = localContent.trim();
      
      // Heading patterns
      const headingMatch = trimmed.match(/^(#{1,3})\s*(.*)$/);
      if (headingMatch) {
        e.preventDefault();
        const level = headingMatch[1].length;
        const content = headingMatch[2];
        onTransform({ type: 'heading', level, content });
        setLocalContent('');
        return;
      }
      
      // Divider
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        e.preventDefault();
        onTransform({ type: 'divider' });
        setLocalContent('');
        return;
      }
      
      // Normal enter - create new block
      if (localContent === '' || textareaRef.current?.selectionStart === localContent.length) {
        e.preventDefault();
        onEnterKey();
        return;
      }
    }
    
    // Delete empty block with Backspace
    if (e.key === 'Backspace' && localContent === '') {
      e.preventDefault();
      onDelete();
      return;
    }
    
    // Escape to close slash menu
    if (e.key === 'Escape' && lastSlashPos.current !== null) {
      e.preventDefault();
      lastSlashPos.current = null;
      setSlashFilterText('');
      onSlashClose();
      return;
    }
    
    // Move block shortcuts
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
    
    // Pass other key events to parent
    onKeyDown(e);
  }, [localContent, onTransform, onEnterKey, onDelete, onSlashClose, onMoveUp, onMoveDown, onKeyDown]);

  // Determine styles based on block type
  const getTextStyles = () => {
    if (block.type === 'heading') {
      switch (block.level) {
        case 1: return 'text-3xl font-bold';
        case 2: return 'text-2xl font-semibold';
        case 3: return 'text-xl font-medium';
        default: return 'text-base';
      }
    }
    return 'text-base leading-relaxed';
  };

  const getPlaceholder = () => {
    if (block.type === 'heading') {
      return `Heading ${block.level}`;
    }
    return "Type '/' for commands...";
  };

  // For text and heading blocks, render inline editable textarea
  if (block.type === 'text' || block.type === 'heading') {
    return (
      <div
        className={`relative rounded-md transition-colors duration-100 ${
          isSelected 
            ? 'bg-accent-green/5 dark:bg-accent-green/10' 
            : isHovered 
              ? 'bg-gray-50 dark:bg-gray-800/30' 
              : ''
        }`}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        tabIndex={0}
      >
        {/* Block actions menu */}
        {(isHovered || isSelected) && (
          <div className="absolute -top-2 right-2 flex items-center gap-1 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-md px-1 py-0.5 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Duplicate"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}

        <div className="py-1">
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            onFocus={onActivate}
            onBlur={onDeactivate}
            placeholder={getPlaceholder()}
            className={`w-full min-h-[1.5em] resize-none bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 ${getTextStyles()}`}
            rows={1}
          />
        </div>
      </div>
    );
  }

  // For other block types, use BlockRenderer
  return (
    <BlockRenderer
      block={block}
      reportId={reportId}
      isSelected={isSelected}
      isHovered={isHovered}
      onSelect={onSelect}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onKeyDown={onKeyDown}
      onOpenTable={onOpenTable}
    />
  );
}

// Empty state - Notion style
function EmptyState({ onAddBlock }: { onAddBlock: () => void }) {
  return (
    <div className="py-4">
      <button
        onClick={onAddBlock}
        className="w-full text-left py-3 px-4 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors group"
      >
        <span className="group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
          Click here to start writing, or press{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-500">
            /
          </kbd>{' '}
          for commands
        </span>
      </button>
    </div>
  );
}

export default BlockEditor;
