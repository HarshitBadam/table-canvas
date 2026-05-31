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
import {
  isTabularData,
  parseTabularData,
  isMarkdownContent,
  markdownToTipTapContent,
} from './markdownParser';

import './EditorStyles.css';


export interface TipTapEditorProps {
  content: JSONContent | null;
  onChange: (content: JSONContent) => void;
  reportId: string;
  editable?: boolean;
  placeholder?: string;
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


export const TipTapEditor = forwardRef<TipTapEditorHandle, TipTapEditorProps>(
  function TipTapEditor(
    {
      content,
      onChange,
      reportId,
      editable = true,
      placeholder = "Type '/' for commands...",
      className = '',
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Editor | null>(null);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          dropcursor: { color: 'rgba(255, 255, 255, 0.3)', width: 2 },
        }),
        Placeholder.configure({
          placeholder: ({ node, editor: ed }) => {
            if (ed.state.doc.firstChild === node && node.type.name === 'heading') {
              return 'Untitled';
            }
            if (node.type.name === 'heading') {
              return `Heading ${node.attrs.level}`;
            }
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
        ChartNode.configure({ reportId }),
        EmbeddedTableNode.configure({ reportId }),
        InlineTableNode.configure({ reportId }),
        EditableTableNode.configure({ reportId }),
        ToggleNode,
        CalloutNode,
        SlashCommands.configure({ reportId }),
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

    editorRef.current = editor;

    useEffect(() => {
      const container = containerRef.current;
      if (!container || !editor) return;

      const handlePaste = (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text/plain');
        if (!text) return;

        if (isTabularData(text)) {
          e.preventDefault();
          e.stopPropagation();

          const tableData = parseTabularData(text);
          if (tableData && tableData.headers.length > 0) {
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
      
      const currentJson = JSON.stringify(editor.getJSON());
      const newJson = JSON.stringify(content);
      
      if (currentJson !== newJson) {
        editor.commands.setContent(content);
      }
    }, [editor, reportId]); // Use reportId as trigger, not content (to avoid loops)

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

