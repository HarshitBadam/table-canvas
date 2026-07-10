import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { SlashCommandList } from './SlashCommandList';
import { getSlashCommandItems } from './SlashCommandItems';
import type { CommandListRef, SlashCommandItem } from './slashCommandTypes';

export function getSlashCommandSuggestion(): Partial<SuggestionOptions<SlashCommandItem>> {
  return {
    char: '/',
    command: ({ editor, range, props }) => props.command({ editor, range }),
    items: ({ query }) => {
      const commands = getSlashCommandItems();
      if (!query) return commands;
      const normalizedQuery = query.toLowerCase();
      return commands.filter(item =>
        item.title.toLowerCase().includes(normalizedQuery)
        || item.description.toLowerCase().includes(normalizedQuery)
        || item.category.toLowerCase().includes(normalizedQuery)
      );
    },
    render: () => {
      let component: ReactRenderer<CommandListRef> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: SuggestionProps<SlashCommandItem>) => {
          component = new ReactRenderer(SlashCommandList, {
            props: { items: props.items, command: props.command },
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
                  options: { fallbackPlacements: ['top-start', 'top-end', 'bottom-end'] },
                },
                {
                  name: 'preventOverflow',
                  options: { boundary: 'viewport', padding: 8 },
                },
              ],
            },
          });
        },
        onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
          component?.updateProps({ items: props.items, command: props.command });
          if (props.clientRect) {
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
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
