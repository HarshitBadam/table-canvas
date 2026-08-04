import { useEditorState, type Editor } from '@tiptap/react';
import { ReportBlockTypeMenu, type BlockType } from './ReportBlockTypeMenu';
import { toolbarDivider, toolbarIconButton, toolbarIconButtonActive } from './toolbarStyles';

interface ReportFormatBarProps {
  editor: Editor | null;
  blocked: { disabled?: boolean; title?: string };
  showDividers?: boolean;
}

const extended = 'flex';

export function ReportFormatBar({ editor, blocked, showDividers = true }: ReportFormatBarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (!instance) return null;
      const heading = ([1, 2, 3] as const).find(level => instance.isActive('heading', { level }));
      return {
        blockType: (heading ? (`h${heading}` as BlockType) : 'paragraph') as BlockType,
        bold: instance.isActive('bold'),
        italic: instance.isActive('italic'),
        underline: instance.isActive('underline'),
        strike: instance.isActive('strike'),
        code: instance.isActive('code'),
        bulletList: instance.isActive('bulletList'),
        orderedList: instance.isActive('orderedList'),
        blockquote: instance.isActive('blockquote'),
        highlight: instance.isActive('highlight'),
        canIndent: instance.can().sinkListItem('listItem'),
        canOutdent: instance.can().liftListItem('listItem'),
      };
    },
  });

  if (!editor || !state) return null;

  const buttonClass = (active: boolean, extra = '') =>
    `${toolbarIconButton} ${active ? toolbarIconButtonActive : ''} ${extra}`;

  const setBlockType = (value: BlockType) => {
    const chain = editor.chain().focus();
    if (value === 'paragraph') {
      chain.setNode('paragraph').run();
      return;
    }
    chain.setNode('heading', { level: Number(value.slice(1)) }).run();
  };

  return (
    <div className="flex min-w-max w-full items-center">
      <div className="shrink-0">
        <ReportBlockTypeMenu
          value={state.blockType}
          onChange={setBlockType}
          disabled={blocked.disabled}
          title={blocked.title}
        />
      </div>

      {showDividers && <span className={toolbarDivider} aria-hidden="true" />}

      <div className="flex min-w-0 flex-1">
        <div className="flex items-center gap-0.5" role="group" aria-label="Text style">
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={state.bold}
          title="Bold (⌘B)"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={buttonClass(state.bold)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 5h6a3.5 3.5 0 010 7H7zm0 7h7a3.5 3.5 0 010 7H7z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={state.italic}
          title="Italic (⌘I)"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={buttonClass(state.italic)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 5h8M6 19h8m1-14L9 19" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Underline"
          aria-pressed={state.underline}
          title="Underline (⌘U)"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={buttonClass(state.underline)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v7a5 5 0 0010 0V4M5 20h14" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Strikethrough"
          aria-pressed={state.strike}
          title="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={buttonClass(state.strike, extended)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M8 7.5A3 3 0 0111 5h2a3 3 0 013 3m-9 8a3 3 0 003 3h2a3 3 0 003-3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Inline code"
          aria-pressed={state.code}
          title="Inline code"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={buttonClass(state.code, extended)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8l-4 4 4 4m6-8l4 4-4 4" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Highlight"
          aria-pressed={state.highlight}
          title="Highlight text"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={buttonClass(state.highlight)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
        </div>
      </div>

      {showDividers && <span className={toolbarDivider} aria-hidden="true" />}

      <div className="shrink-0">
        <div className="flex items-center gap-0.5" role="group" aria-label="Paragraph structure">
        <button
          type="button"
          aria-label="Bullet list"
          aria-pressed={state.bulletList}
          title="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={buttonClass(state.bulletList)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Numbered list"
          aria-pressed={state.orderedList}
          title="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={buttonClass(state.orderedList)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6h10M10 12h10M10 18h10M4 6h1.5M4 12h2M4 18h2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Decrease indent"
          title="Decrease indent"
          disabled={blocked.disabled || !state.canOutdent}
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          className={buttonClass(false, extended)}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 6H10m10 6H10m10 6H10M7 9l-3 3 3 3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Increase indent"
          title="Increase indent"
          disabled={blocked.disabled || !state.canIndent}
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          className={buttonClass(false, extended)}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 6H10m10 6H10m10 6H10M4 9l3 3-3 3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Quote"
          aria-pressed={state.blockquote}
          title="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={buttonClass(state.blockquote, extended)}
          {...blocked}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5v14M9 8h10M9 12h10M9 16h6" />
          </svg>
        </button>
        </div>
      </div>
    </div>
  );
}
