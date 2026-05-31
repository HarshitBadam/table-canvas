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

import { type SlashCommandItem, type SlashCommandsOptions, getCommands } from './SlashCommandItems';

interface CommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}


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

