/**
 * SlashCommands - TipTap Extension for Slash Commands
 * 
 * Notion-like slash command menu for inserting blocks.
 */

import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { 
  useState, 
  useEffect, 
  useCallback, 
  useRef, 
  forwardRef, 
  useImperativeHandle,
  memo 
} from 'react';
import { useProjectStore } from '@/state/projectStore';
import type { TableNode as TableNodeType } from '@/types';


import type { Editor } from '@tiptap/react';
import type { Range } from '@tiptap/core';

interface SlashCommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (props: { editor: Editor; range: Range }) => void;
  category: string;
}

interface SlashCommandsOptions {
  reportId?: string;
  onOpenTable?: (tableId: string) => void;
  suggestion?: Partial<SuggestionOptions>;
}

interface CommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}


const TextIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
  </svg>
);

const H1Icon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <text x="3" y="18" fontSize="14" fontWeight="bold">H1</text>
  </svg>
);

const H2Icon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <text x="3" y="18" fontSize="14" fontWeight="bold">H2</text>
  </svg>
);

const H3Icon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <text x="3" y="18" fontSize="14" fontWeight="bold">H3</text>
  </svg>
);

const BulletIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

const NumberIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
);

const QuoteIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>
);

const DividerIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
  </svg>
);

const CodeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
  </svg>
);

const ToggleIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const CalloutIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);

const TableIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" />
  </svg>
);

const EmbedIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
  </svg>
);


const CommandList = memo(forwardRef<CommandListRef, CommandListProps>(
  function CommandList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      const selectedElement = scrollRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const selectItem = useCallback((index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    }, [items, command]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }), [items.length, selectItem, selectedIndex]);

    if (items.length === 0) {
      return (
        <div className="slash-command-menu">
          <div className="p-3 text-sm text-gray-400">No results</div>
        </div>
      );
    }

    // Group items by category
    const groupedItems: Record<string, SlashCommandItem[]> = {};
    items.forEach(item => {
      if (!groupedItems[item.category]) {
        groupedItems[item.category] = [];
      }
      groupedItems[item.category].push(item);
    });

    let globalIndex = 0;

    return (
      <div className="slash-command-menu" ref={scrollRef}>
        {Object.entries(groupedItems).map(([category, categoryItems]) => (
          <div key={category} className="slash-command-group">
            <div className="slash-command-group-title">{category}</div>
            {categoryItems.map((item) => {
              const index = globalIndex++;
              return (
                <div
                  key={item.title}
                  data-index={index}
                  className={`slash-command-item ${selectedIndex === index ? 'is-active' : ''}`}
                  onClick={() => selectItem(index)}
                >
                  <div className="slash-command-icon">{item.icon}</div>
                  <div className="slash-command-text">
                    <div className="slash-command-title">{item.title}</div>
                    <div className="slash-command-description">{item.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
));


function getCommands(_options: SlashCommandsOptions): SlashCommandItem[] {
  const tables = Object.values(useProjectStore.getState().nodes)
    .filter(n => 'type' in n && n.type === 'table') as TableNodeType[];

  return [
    // Basic blocks
    {
      title: 'Text',
      description: 'Plain text paragraph',
      icon: <TextIcon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('paragraph').run();
      },
    },
    {
      title: 'Heading 1',
      description: 'Large section heading',
      icon: <H1Icon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
      },
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: <H2Icon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
      },
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      icon: <H3Icon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
      },
    },
    {
      title: 'Bullet List',
      description: 'Create a bullet list',
      icon: <BulletIcon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: 'Numbered List',
      description: 'Create a numbered list',
      icon: <NumberIcon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: 'Quote',
      description: 'Add a blockquote',
      icon: <QuoteIcon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: 'Divider',
      description: 'Visual separator',
      icon: <DividerIcon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: 'Code Block',
      description: 'Code snippet with syntax',
      icon: <CodeIcon />,
      category: 'Basic',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },

    // Structured blocks
    {
      title: 'Toggle',
      description: 'Collapsible section',
      icon: <ToggleIcon />,
      category: 'Structured',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'toggle',
          attrs: { title: 'Toggle', isExpanded: true },
          content: [{ type: 'paragraph' }],
        }).run();
      },
    },
    {
      title: 'Callout',
      description: 'Highlighted note block',
      icon: <CalloutIcon />,
      category: 'Structured',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'callout',
          attrs: { variant: 'info' },
          content: [{ type: 'paragraph' }],
        }).run();
      },
    },

    // Data blocks
    {
      title: 'Chart',
      description: 'Visualize data from a table',
      icon: <ChartIcon />,
      category: 'Data',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'chartBlock',
          attrs: { 
            sourceTableId: tables[0]?.id || '',
            chartType: 'bar',
            config: { showLegend: true, showGrid: true },
          },
        }).run();
      },
    },
    {
      title: 'Embed Table',
      description: 'Embed data from a table',
      icon: <EmbedIcon />,
      category: 'Data',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'embeddedTable',
          attrs: {
            sourceTableId: tables[0]?.id || '',
            selectedColumns: [],
            rowSelectionMode: 'first_n',
            rowLimit: 10,
          },
        }).run();
      },
    },
    {
      title: 'New Table',
      description: 'Create an editable table',
      icon: <TableIcon />,
      category: 'Data',
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'editableTable',
          attrs: {
            headers: ['Column 1', 'Column 2', 'Column 3'],
            rows: [['', '', ''], ['', '', '']],
          },
        }).run();
      },
    },
  ];
}


function getSuggestionConfig(options: SlashCommandsOptions): Partial<SuggestionOptions<SlashCommandItem>> {
  return {
    char: '/',
    command: ({ editor, range, props }) => {
      props.command({ editor, range });
    },
    items: ({ query }) => {
      const commands = getCommands(options);
      if (!query) return commands;
      
      const lowerQuery = query.toLowerCase();
      return commands.filter(item => 
        item.title.toLowerCase().includes(lowerQuery) ||
        item.description.toLowerCase().includes(lowerQuery) ||
        item.category.toLowerCase().includes(lowerQuery)
      );
    },
    render: () => {
      let component: ReactRenderer<CommandListRef> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: SuggestionProps<SlashCommandItem>) => {
          component = new ReactRenderer(CommandList, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            animation: 'shift-away',
            theme: 'slash-command',
            popperOptions: {
              modifiers: [
                {
                  name: 'flip',
                  options: {
                    fallbackPlacements: ['top-start', 'top-end', 'bottom-end'],
                  },
                },
                {
                  name: 'preventOverflow',
                  options: {
                    boundary: 'viewport',
                    padding: 8,
                  },
                },
              ],
            },
          });
        },

        onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
          component?.updateProps({
            items: props.items,
            command: props.command,
          });

          if (!props.clientRect) return;

          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        },

        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }

          return component?.ref?.onKeyDown(props) || false;
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    },
  };
}


export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      reportId: undefined,
      onOpenTable: undefined,
      suggestion: {},
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...getSuggestionConfig(this.options),
        ...this.options.suggestion,
      }),
    ];
  },
});

export default SlashCommands;
