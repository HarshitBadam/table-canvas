import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ChartNodeView } from './ChartNodeView';
import type { ChartNodeOptions } from './chartNodeTypes';

export const ChartNode = Node.create<ChartNodeOptions>({
  name: 'chartBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      reportId: undefined,
      onOpenTable: undefined,
    };
  },

  addAttributes() {
    return {
      sourceTableId: { default: '' },
      chartType: { default: 'bar' },
      config: {
        default: {
          showLegend: true,
          showGrid: true,
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'chart-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeView);
  },

  addKeyboardShortcuts() {
    const deleteSelectedNode = () => {
      const { selection } = this.editor.state;
      const parentNode = selection.$anchor.parent;
      if (parentNode.type.name === this.name || selection.$anchor.nodeAfter?.type.name === this.name) {
        return this.editor.commands.deleteSelection();
      }
      return false;
    };
    return {
      Backspace: deleteSelectedNode,
      Delete: deleteSelectedNode,
    };
  },
});

export default ChartNode;
