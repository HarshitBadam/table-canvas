import { useProjectStore } from '@/state/projectStore';
import type { TableNode } from '@/types';
import {
  BulletIcon,
  CalloutIcon,
  ChartIcon,
  CodeIcon,
  DividerIcon,
  EmbedIcon,
  H1Icon,
  H2Icon,
  H3Icon,
  NumberIcon,
  QuoteIcon,
  TableIcon,
  TextIcon,
  ToggleIcon,
} from './SlashCommandIcons';
import type { SlashCommandItem } from './slashCommandTypes';

export type { SlashCommandItem, SlashCommandsOptions } from './slashCommandTypes';

export function getSlashCommandItems(): SlashCommandItem[] {
  const tables = Object.values(useProjectStore.getState().nodes).filter(
    (node): node is TableNode => node.kind === 'source_table' || node.kind === 'derived_table'
  );

  return [
    {
      title: 'Text',
      description: 'Plain text paragraph',
      icon: <TextIcon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('paragraph').run(),
    },
    {
      title: 'Heading 1',
      description: 'Large section heading',
      icon: <H1Icon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: <H2Icon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      icon: <H3Icon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
    {
      title: 'Bullet List',
      description: 'Create a bullet list',
      icon: <BulletIcon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: 'Numbered List',
      description: 'Create a numbered list',
      icon: <NumberIcon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: 'Quote',
      description: 'Add a blockquote',
      icon: <QuoteIcon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: 'Divider',
      description: 'Visual separator',
      icon: <DividerIcon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: 'Code Block',
      description: 'Code snippet with syntax',
      icon: <CodeIcon />,
      category: 'Basic',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
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
