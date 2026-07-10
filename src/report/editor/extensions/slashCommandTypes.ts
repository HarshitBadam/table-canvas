import type { Range } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { ReactNode } from 'react';

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: ReactNode;
  command: (props: { editor: Editor; range: Range }) => void;
  category: string;
}

export interface SlashCommandsOptions {
  reportId?: string;
  onOpenTable?: (tableId: string) => void;
  suggestion?: Partial<SuggestionOptions>;
}

export interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}
