/**
 * TipTap Editor Component
 * 
 * A Notion-like block editor built on TipTap.
 * Seamless single-page experience with title integrated into content.
 */

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { useCallback, forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import type { JSONContent } from '@tiptap/react';

import { ChartNode } from './nodes/ChartNode';
import { EmbeddedTableNode } from './nodes/EmbeddedTableNode';
import { InlineTableNode } from './nodes/InlineTableNode';
import { EditableTableNode } from './nodes/EditableTableNode';
import { ToggleNode } from './nodes/ToggleNode';
import { CalloutNode } from './nodes/CalloutNode';
import { SlashCommands } from './extensions/SlashCommands';

import './EditorStyles.css';

// ============================================================================
// Markdown Parser
// ============================================================================

function parseInlineFormatting(text: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold: **text**
    let match = remaining.match(/^\*\*(.+?)\*\*/);
    if (match) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'bold' }] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic: *text*
    match = remaining.match(/^\*([^*]+)\*/);
    if (match) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'italic' }] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Code: `text`
    match = remaining.match(/^`([^`]+)`/);
    if (match) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'code' }] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Link: [text](url)
    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      nodes.push({ type: 'text', text: match[1], marks: [{ type: 'link', attrs: { href: match[2] } }] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Plain text
    match = remaining.match(/^[^*`[]+/);
    if (match && match[0]) {
      nodes.push({ type: 'text', text: match[0] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Fallback
    nodes.push({ type: 'text', text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return nodes;
}

function markdownToTipTapContent(markdown: string): JSONContent[] {
  const lines = markdown.split('\n');
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      content.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const text = headingMatch[2];
      const inlineContent = parseInlineFormatting(text);
      content.push({
        type: 'heading',
        attrs: { level },
        content: inlineContent.length > 0 ? inlineContent : [{ type: 'text', text: '' }],
      });
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      content.push({
        type: 'codeBlock',
        content: [{ type: 'text', text: codeLines.join('\n') }],
      });
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.slice(2);
      content.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: parseInlineFormatting(quoteText) }],
      });
      i++;
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineFormatting(itemText) }],
        });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineFormatting(itemText) }],
        });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // Markdown table (| col1 | col2 |)
    if (isMarkdownTable(lines, i)) {
      const { rows, endIndex } = parseMarkdownTable(lines, i);
      if (rows.length > 0) {
        const headers = rows[0];
        const dataRows = rows.slice(1);
        
        // Create editable table node - MUST set initialized: true to skip dialog
        content.push({
          type: 'editableTable',
          attrs: {
            headers: headers,
            rows: dataRows.length > 0 ? dataRows : [headers.map(() => '')],
            initialized: true, // Important: skip the dimension picker dialog
          },
        });
      }
      i = endIndex;
      continue;
    }

    // Paragraph
    content.push({
      type: 'paragraph',
      content: parseInlineFormatting(trimmed),
    });
    i++;
  }

  return content;
}

function isMarkdownContent(text: string): boolean {
  return /^#{1,6}\s/m.test(text) ||
         /^[-*]\s+\S/m.test(text) ||
         /^[-*_]{3,}$/m.test(text) ||
         /^\d+\.\s+/m.test(text) ||
         /^>\s/m.test(text) ||
         /```/.test(text) ||
         /^\|.+\|$/m.test(text); // Markdown tables
}

// Check if lines are a markdown table
function isMarkdownTable(lines: string[], startIndex: number): boolean {
  if (startIndex >= lines.length) return false;
  const line = lines[startIndex].trim();
  
  // Must have pipe characters
  if (!line.includes('|')) return false;
  
  // Check if this line looks like a table row
  const pipeCount = (line.match(/\|/g) || []).length;
  if (pipeCount < 1) return false;
  
  // Check if next line is separator row (|---|---| or ---|---|)
  if (startIndex + 1 < lines.length) {
    const nextLine = lines[startIndex + 1].trim();
    // Separator row contains dashes and possibly colons between pipes
    if (/^\|?[\s]*[-:]+[\s]*\|/.test(nextLine) || /[-:]+[\s]*\|[\s]*[-:]/.test(nextLine)) {
      return true;
    }
  }
  
  // Also detect if first line has pipes and multiple columns
  if (pipeCount >= 2) {
    // Could be a header row, check next line for separator
    if (startIndex + 1 < lines.length) {
      const nextLine = lines[startIndex + 1].trim();
      // Check for separator pattern more loosely
      if (nextLine.includes('|') && nextLine.includes('-')) {
        return true;
      }
    }
  }
  
  return false;
}

// Parse markdown table into editable table node data
function parseMarkdownTable(lines: string[], startIndex: number): { rows: string[][]; endIndex: number } {
  const rows: string[][] = [];
  let i = startIndex;
  let maxCols = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Stop if empty line or no pipes
    if (!line || !line.includes('|')) break;
    
    // Skip separator row (contains only |, -, :, and spaces)
    if (/^[\s|:-]+$/.test(line) && line.includes('-')) {
      i++;
      continue;
    }
    
    // Parse cells - handle both | col | col | and col | col formats
    let cells: string[];
    if (line.startsWith('|')) {
      cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());
    } else {
      cells = line.split('|').map(cell => cell.trim());
    }
    
    if (cells.length > 0 && cells.some(c => c.length > 0)) {
      rows.push(cells);
      maxCols = Math.max(maxCols, cells.length);
    }
    i++;
  }
  
  // Normalize rows to have same number of columns
  const normalizedRows = rows.map(row => {
    if (row.length < maxCols) {
      return [...row, ...Array(maxCols - row.length).fill('')];
    }
    return row;
  });
  
  return { rows: normalizedRows, endIndex: i };
}

// ============================================================================
// Table Data Parser (TSV/CSV)
// ============================================================================

function isTabularData(text: string): boolean {
  const lines = text.trim().split('\n');
  if (lines.length < 1) return false;
  
  // Check if most lines have tabs (TSV) or consistent column counts
  const tabCounts = lines.map(line => (line.match(/\t/g) || []).length);
  const hasConsistentTabs = tabCounts.length > 1 && tabCounts[0] > 0 && 
    tabCounts.every(count => count === tabCounts[0]);
  
  return hasConsistentTabs;
}

function parseTabularData(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length < 1) return null;
  
  // Parse as TSV
  const rows = lines.map(line => line.split('\t').map(cell => cell.trim()));
  
  // First row is headers
  const headers = rows[0];
  const dataRows = rows.slice(1);
  
  // Ensure all rows have same column count
  const colCount = headers.length;
  const normalizedRows = dataRows.map(row => {
    if (row.length < colCount) {
      return [...row, ...Array(colCount - row.length).fill('')];
    }
    return row.slice(0, colCount);
  });
  
  return { headers, rows: normalizedRows };
}

// ============================================================================
// Types
// ============================================================================

export interface TipTapEditorProps {
  content: JSONContent | null;
  onChange: (content: JSONContent) => void;
  reportId: string;
  editable?: boolean;
  placeholder?: string;
  onOpenTable?: (tableId: string) => void;
  className?: string;
}

export interface TipTapEditorHandle {
  getEditor: () => Editor | null;
  focus: () => void;
  getHTML: () => string;
  getJSON: () => JSONContent;
  toggleHighlight: () => void;
  insertTable: () => void;
}

// ============================================================================
// Component
// ============================================================================

export const TipTapEditor = forwardRef<TipTapEditorHandle, TipTapEditorProps>(
  function TipTapEditor(
    {
      content,
      onChange,
      reportId,
      editable = true,
      placeholder = "Type '/' for commands...",
      onOpenTable,
      className = '',
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);

    // Initialize editor with extensions
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          dropcursor: { color: 'rgba(255, 255, 255, 0.3)', width: 2 },
        }),
        Placeholder.configure({
          placeholder: ({ node, editor: ed }) => {
            // First heading (title)
            if (ed.state.doc.firstChild === node && node.type.name === 'heading') {
              return 'Untitled';
            }
            // Other headings
            if (node.type.name === 'heading') {
              return `Heading ${node.attrs.level}`;
            }
            // Only show on top-level paragraphs
            return placeholder;
          },
          showOnlyWhenEditable: true,
          showOnlyCurrent: true,
          includeChildren: false,
        }),
        Highlight.configure({ multicolor: true }),
        Typography,
        Underline,
        Link.configure({ openOnClick: false }),
        // Custom nodes
        ChartNode.configure({ reportId, onOpenTable }),
        EmbeddedTableNode.configure({ reportId, onOpenTable }),
        InlineTableNode.configure({ reportId }),
        EditableTableNode.configure({ reportId }),
        ToggleNode,
        CalloutNode,
        // Slash commands
        SlashCommands.configure({ reportId, onOpenTable }),
      ],
      content: content || {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Untitled' }] },
          { type: 'paragraph' },
        ],
      },
      editable,
      autofocus: 'end',
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getJSON());
      },
      editorProps: {
        attributes: {
          class: 'tiptap-editor-content',
          spellcheck: 'false',
        },
      },
    });

    // Store editor ref
    editorRef.current = editor;

    // Handle paste events directly on the container
    useEffect(() => {
      const container = containerRef.current;
      if (!container || !editor) return;

      const handlePaste = (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain');
        if (!text) return;

        // Check if it's tabular data (TSV from spreadsheet/grid)
        if (isTabularData(text)) {
          e.preventDefault();
          e.stopPropagation();

          const tableData = parseTabularData(text);
          if (tableData && tableData.headers.length > 0) {
            // Insert as inline table node
            editor.commands.insertContent({
              type: 'inlineTable',
              attrs: {
                headers: tableData.headers,
                rows: tableData.rows,
              },
            });
          }
          return;
        }

        // Check if it's markdown
        if (isMarkdownContent(text)) {
          e.preventDefault();
          e.stopPropagation();

          const parsedContent = markdownToTipTapContent(text);
          
          if (parsedContent.length > 0) {
            editor.commands.insertContent(parsedContent);
          }
        }
      };

      container.addEventListener('paste', handlePaste, true);
      return () => container.removeEventListener('paste', handlePaste, true);
    }, [editor]);

    // Expose editor methods via ref
    useImperativeHandle(ref, () => ({
      getEditor: () => editor,
      focus: () => editor?.commands.focus('end'),
      getHTML: () => editor?.getHTML() || '',
      getJSON: () => editor?.getJSON() || { type: 'doc', content: [] },
      toggleHighlight: () => editor?.chain().focus().toggleHighlight({ color: '#d1fae5' }).run(),
      insertTable: () => editor?.chain().focus().insertContent({
        type: 'editableTable',
        attrs: { headers: [], rows: [], initialized: false },
      }).run(),
    }), [editor]);

    // Sync editor content when reportId changes (for switching between reports)
    useEffect(() => {
      if (!editor || !content) return;
      
      // Compare current editor content with new content
      const currentJson = JSON.stringify(editor.getJSON());
      const newJson = JSON.stringify(content);
      
      // Only update if content actually changed
      if (currentJson !== newJson) {
        editor.commands.setContent(content);
      }
    }, [editor, reportId]); // Use reportId as trigger, not content (to avoid loops)

    // Handle click on editor container to focus at end
    const handleContainerClick = useCallback((e: React.MouseEvent) => {
      if (e.target === e.currentTarget && editor) {
        editor.commands.focus('end');
      }
    }, [editor]);

    if (!editor) {
      return (
        <div className="tiptap-editor-loading">
          <div className="animate-pulse h-10 bg-gray-100 dark:bg-gray-800 rounded w-1/2 mb-4" />
          <div className="animate-pulse h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
        </div>
      );
    }

    return (
      <div 
        ref={containerRef}
        className={`tiptap-editor ${className}`} 
        onClick={handleContainerClick}
      >
        <EditorContent editor={editor} />
      </div>
    );
  }
);

export default TipTapEditor;
