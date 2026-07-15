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
import { AtomicBlockNavigation } from './extensions/AtomicBlockNavigation';
import {
  isMarkdownContent,
  isTabularData,
  markdownToTipTapContent,
  parseTabularData,
} from './markdownParser';

import './EditorStyles.css';

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
  insertEmbeddedTable: () => void;
  insertChart: () => void;
}

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
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          dropcursor: { color: 'rgba(255, 255, 255, 0.3)', width: 2 },
        }),
        Placeholder.configure({
          placeholder: ({ node, editor: editorInstance }) => {
            if (editorInstance.state.doc.firstChild === node && node.type.name === 'heading') {
              return 'Untitled';
            }
            return node.type.name === 'heading' ? `Heading ${node.attrs.level}` : placeholder;
          },
          showOnlyWhenEditable: true,
          showOnlyCurrent: true,
          includeChildren: false,
        }),
        Highlight,
        Typography,
        Underline,
        Link.configure({ openOnClick: false }),
        ChartNode.configure({ reportId, onOpenTable }),
        EmbeddedTableNode.configure({ reportId, onOpenTable }),
        InlineTableNode.configure({ reportId }),
        EditableTableNode.configure({ reportId }),
        ToggleNode,
        CalloutNode,
        AtomicBlockNavigation,
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
      onUpdate: ({ editor: editorInstance }) => onChange(editorInstance.getJSON()),
      editorProps: {
        attributes: {
          class: 'tiptap-editor-content',
          spellcheck: 'true',
        },
      },
    });

    useEffect(() => {
      const container = containerRef.current;
      if (!container || !editor) return;

      const handlePaste = (event: ClipboardEvent) => {
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return;

        if (isTabularData(text)) {
          const tableData = parseTabularData(text);
          if (!tableData?.headers.length) return;
          event.preventDefault();
          event.stopPropagation();
          editor.commands.insertContent({
            type: 'inlineTable',
            attrs: { headers: tableData.headers, rows: tableData.rows },
          });
          return;
        }

        if (!isMarkdownContent(text)) return;
        const parsedContent = markdownToTipTapContent(text);
        if (!parsedContent.length) return;
        event.preventDefault();
        event.stopPropagation();
        editor.commands.insertContent(parsedContent);
      };

      container.addEventListener('paste', handlePaste, true);
      return () => container.removeEventListener('paste', handlePaste, true);
    }, [editor]);

    useImperativeHandle(ref, () => ({
      getEditor: () => editor,
      focus: () => editor?.commands.focus('end'),
      getHTML: () => editor?.getHTML() || '',
      getJSON: () => editor?.getJSON() || { type: 'doc', content: [] },
      toggleHighlight: () => editor?.chain().focus().toggleHighlight().run(),
      insertTable: () => editor?.chain().focus().insertContent({
        type: 'editableTable',
        attrs: { headers: [], rows: [], initialized: false },
      }).run(),
      insertEmbeddedTable: () => editor?.chain().focus().insertContent({
        type: 'embeddedTable',
        attrs: {
          sourceTableId: '',
          selectedColumns: [],
          rowSelectionMode: 'first_n',
          rowLimit: 10,
        },
      }).run(),
      insertChart: () => editor?.chain().focus().insertContent({
        type: 'chartBlock',
        attrs: {
          sourceTableId: '',
          chartType: 'bar',
          config: { showLegend: true, showGrid: true },
        },
      }).run(),
    }), [editor]);

    useEffect(() => {
      if (!editor || !content) return;
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
        editor.commands.setContent(content);
      }
      // This is intentionally keyed to report changes to avoid cursor jumps from external updates.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, reportId]);

    const handleContainerClick = useCallback((event: React.MouseEvent) => {
      if (event.target === event.currentTarget) editor?.commands.focus('end');
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
      <div ref={containerRef} className={`tiptap-editor ${className}`} onClick={handleContainerClick}>
        <EditorContent editor={editor} />
      </div>
    );
  }
);
