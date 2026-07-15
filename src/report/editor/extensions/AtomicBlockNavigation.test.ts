import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AtomicBlockNavigation } from './AtomicBlockNavigation';

const TestBlock = Node.create({
  name: 'testBlock',
  group: 'block',
  atom: true,
  parseHTML: () => [{ tag: 'div[data-type="test-block"]' }],
  renderHTML: () => ['div', { 'data-type': 'test-block' }],
});

function createEditor(content: object): Editor {
  return new Editor({
    extensions: [StarterKit, TestBlock, AtomicBlockNavigation],
    content,
  });
}

function pressKey(editorInstance: Editor, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  editorInstance.view.dom.dispatchEvent(event);
  return event;
}

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('AtomicBlockNavigation', () => {
  it('keeps an editable paragraph after a document-ending atomic block', async () => {
    editor = createEditor({
      type: 'doc',
      content: [{ type: 'testBlock' }],
    });

    await waitFor(() => {
      expect(editor?.getJSON().content?.map(node => node.type)).toEqual([
        'testBlock',
        'paragraph',
      ]);
    });
  });

  it.each(['Enter', 'ArrowDown'])(
    'moves the caret below a selected block with %s',
    shortcut => {
      editor = createEditor({
        type: 'doc',
        content: [{ type: 'testBlock' }],
      });
      editor.commands.setNodeSelection(0);

      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect(pressKey(editor, shortcut).defaultPrevented).toBe(true);
      expect(editor.state.selection).toBeInstanceOf(TextSelection);
      expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    },
  );

  it('moves the caret above a selected block with ArrowUp', () => {
    editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'testBlock' },
      ],
    });
    const blockPosition = editor.state.doc.child(0).nodeSize;
    editor.commands.setNodeSelection(blockPosition);

    expect(pressKey(editor, 'ArrowUp').defaultPrevented).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.$from.parent.textContent).toBe('Before');
  });
});
