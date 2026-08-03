import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { useCallback, forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import type { GridClipboardData } from '@/grid/types';

import { ChartNode } from './nodes/linked-data/ChartNode';
import { EmbeddedTableNode } from './nodes/linked-data/EmbeddedTableNode';
import { InlineTableNode } from './nodes/tables/InlineTableNode';
import { EditableTableNode } from './nodes/tables/EditableTableNode';
import { PasteTableHeadersModal } from './nodes/tables/PasteTableHeadersModal';
import { ToggleNode } from './nodes/ToggleNode';
import { CalloutNode } from './nodes/CalloutNode';
import { SlashCommands } from './extensions/SlashCommands';
import { AtomicBlockNavigation, withoutCaret } from './extensions/AtomicBlockNavigation';
import {
  isMarkdownContent,
  isTabularData,
  markdownToTipTapContent,
  parseTabularData,
} from './markdownParser';

import './EditorStyles.css';

/**
 * Surfaces that act on the selected block but are not rendered inside it: a
 * menu or dialog is layered over the report, so containment cannot decide it.
 * Everything else is judged by whether the click landed in the selected
 * block's own DOM, which is the only test that distinguishes "this block" from
 * "a block".
 */
const KEEPS_BLOCK_SELECTION = '.table-context-menu, [role="dialog"]';
const GRID_CLIPBOARD_MAX_AGE_MS = 2 * 60 * 1000;

export interface TipTapEditorProps {
  content: JSONContent | null;
  onChange: (content: JSONContent) => void;
  reportId: string;
  editable?: boolean;
  placeholder?: string;
  onOpenTable?: (tableId: string) => void;
  onEditorReady?: (editor: Editor | null) => void;
  className?: string;
}

export interface TipTapEditorHandle {
  focus: () => void;
  getJSON: () => JSONContent;
  insertTable: () => void;
  insertEmbeddedTable: () => void;
  insertChart: () => void;
}

interface PendingTablePaste {
  headers: string[];
  rows: string[][];
  sourceInfo: {
    tableId: string;
    tableName: string;
    columnIds: string[];
  } | null;
  selection: { from: number; to: number };
}

function matchesGridClipboard(
  clipboard: GridClipboardData | undefined,
  pastedRows: string[][],
  now = Date.now(),
): clipboard is GridClipboardData {
  if (!clipboard || !Number.isFinite(clipboard.timestamp)) return false;

  const age = now - clipboard.timestamp;
  if (age < 0 || age > GRID_CLIPBOARD_MAX_AGE_MS) return false;
  if (
    !Array.isArray(clipboard.headers)
    || !Array.isArray(clipboard.columnIds)
    || !Array.isArray(clipboard.rows)
    || typeof clipboard.sourceTableId !== 'string'
    || typeof clipboard.sourceTableName !== 'string'
    || clipboard.headers.length === 0
    || clipboard.headers.length !== clipboard.columnIds.length
    || clipboard.rows.length !== pastedRows.length
    || !clipboard.headers.every(header => typeof header === 'string')
    || !clipboard.columnIds.every(columnId => typeof columnId === 'string')
  ) {
    return false;
  }

  return clipboard.rows.every((sourceRow, rowIndex) => (
    Array.isArray(sourceRow)
    && sourceRow.length === clipboard.headers.length
    && pastedRows[rowIndex].length === clipboard.headers.length
    && sourceRow.every(
      (cell, columnIndex) => String(cell ?? '').trim() === pastedRows[rowIndex][columnIndex],
    )
  ));
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
      onEditorReady,
      className = '',
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pendingTablePaste, setPendingTablePaste] = useState<PendingTablePaste | null>(null);
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          dropcursor: { color: 'rgba(255, 255, 255, 0.3)', width: 2 },
          gapcursor: false,
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
      onEditorReady?.(editor);
      return () => onEditorReady?.(null);
    }, [editor, onEditorReady]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container || !editor) return;

      const handlePaste = (event: ClipboardEvent) => {
        const text = event.clipboardData?.getData('text/plain');
        if (!text || !editor.isEditable) return;

        if (isTabularData(text)) {
          const tableData = parseTabularData(text);
          if (!tableData?.rows.length) return;
          event.preventDefault();
          event.stopPropagation();

          const gridClipboard = matchesGridClipboard(window.__gridClipboard, tableData.rows)
            ? window.__gridClipboard
            : undefined;
          const headers = gridClipboard?.headers
            ?? tableData.rows[0].map((_, index) => `Column ${index + 1}`);
          setPendingTablePaste({
            headers,
            rows: tableData.rows,
            sourceInfo: gridClipboard
              ? {
                tableId: gridClipboard.sourceTableId,
                tableName: gridClipboard.sourceTableName,
                columnIds: gridClipboard.columnIds,
              }
              : null,
            selection: {
              from: editor.state.selection.from,
              to: editor.state.selection.to,
            },
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

    const insertPendingTable = useCallback((showHeaders: boolean) => {
      if (!editor || !pendingTablePaste) return;
      const { headers, rows, sourceInfo, selection } = pendingTablePaste;
      const documentSize = editor.state.doc.content.size;
      const from = Math.min(selection.from, documentSize);
      const to = Math.min(selection.to, documentSize);

      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .insertContent({
          type: 'inlineTable',
          attrs: { headers, rows, showHeaders, sourceInfo },
        })
        .run();
      setPendingTablePaste(null);
    }, [editor, pendingTablePaste]);

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus('end'),
      getJSON: () => editor?.getJSON() || { type: 'doc', content: [] },
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

    // `useEditor` deliberately keeps its own editable flag when options are re-applied,
    // so lease changes must update it explicitly.
    useEffect(() => {
      if (!editor || editor.isEditable === editable) return;
      editor.setEditable(editable);
    }, [editable, editor]);

    // A read-only editor has no cursor to protect, so it can follow live content from the
    // tab that is editing.
    useEffect(() => {
      if (!editor || editable || !content) return;
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
        editor.commands.setContent(content);
      }
    }, [content, editable, editor]);

    useEffect(() => {
      if (!editor) return;

      const clearBlockSelection = (event: MouseEvent) => {
        const { selection } = editor.state;
        if (!(selection instanceof NodeSelection)) return;

        const target = event.target;
        if (target instanceof Element) {
          if (target.closest(KEEPS_BLOCK_SELECTION)) return;
          // The selected block's own body, whatever it is made of. Matching a
          // list of block surfaces instead answered "is this some block?", so
          // clicking into a second block left the first one selected too.
          const selectedDOM = editor.view.nodeDOM(selection.from);
          if (selectedDOM instanceof Element && selectedDOM.contains(target)) return;
        }

        // A block stays selected only while the pointer is on the block itself.
        // Node views swallow their own mouse events and a click can also land
        // in app chrome outside the editor, so this listens once at the
        // document boundary rather than in several overlapping places.
        //
        // The caret is deliberately not taken along. The position after a block
        // is a structural gap, and this runs on mousedown: with a real caret in
        // it the gap would expand for the frame between press and release and
        // then collapse again once the click resolved to wherever it was
        // actually aimed.
        const { doc, tr } = editor.state;
        editor.view.dispatch(
          withoutCaret(tr.setSelection(Selection.near(doc.resolve(selection.to), 1))),
        );
      };

      document.addEventListener('mousedown', clearBlockSelection, true);
      return () => document.removeEventListener('mousedown', clearBlockSelection, true);
    }, [editor]);

    const handleContainerClick = useCallback((event: React.MouseEvent) => {
      // The area around a report is a dismissal surface, not an implicit "add
      // text at the end" target. Keeping focus here left the trailing structural
      // paragraph's slash hint visible after users clicked away from it.
      if (event.target === event.currentTarget) editor?.commands.blur();
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
        {pendingTablePaste && (
          <PasteTableHeadersModal
            headers={pendingTablePaste.headers}
            rows={pendingTablePaste.rows}
            onChoose={insertPendingTable}
            onClose={() => setPendingTablePaste(null)}
          />
        )}
      </div>
    );
  }
);
