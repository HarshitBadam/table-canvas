import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { getSlashCommandSuggestion } from './slashCommandSuggestion';
import type { SlashCommandsOptions } from './slashCommandTypes';

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
        ...getSlashCommandSuggestion(),
        ...this.options.suggestion,
      }),
    ];
  },
});

export default SlashCommands;
