import { Extension } from '@tiptap/core';
import { NodeSelection, Plugin, Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

function trailingParagraphTransaction(state: EditorState): Transaction | null {
  const { doc, schema } = state;
  const lastNode = doc.lastChild;
  const paragraph = schema.nodes.paragraph;

  if (!lastNode || lastNode.isTextblock || !paragraph) return null;
  return state.tr.insert(doc.content.size, paragraph.create());
}

export const AtomicBlockNavigation = Extension.create({
  name: 'atomicBlockNavigation',
  priority: 1_000,

  onCreate() {
    const transaction = trailingParagraphTransaction(this.editor.state);
    if (transaction) this.editor.view.dispatch(transaction);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          return trailingParagraphTransaction(newState);
        },
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== 'Enter' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
              return false;
            }

            const direction = event.key === 'ArrowUp' ? -1 : 1;
            return moveFromSelectedBlock(view, direction);
          },
        },
      }),
    ];
  },
});

function moveFromSelectedBlock(view: EditorView, direction: -1 | 1): boolean {
  const { state } = view;
  const { selection } = state;

  if (!(selection instanceof NodeSelection) || !selection.node.isBlock) return false;

  const boundary = direction === 1 ? selection.to : selection.from;
  let transaction = state.tr;
  let nextSelection = Selection.findFrom(state.doc.resolve(boundary), direction, true);

  if (!nextSelection && direction === 1) {
    const paragraph = state.schema.nodes.paragraph;
    if (!paragraph) return false;
    transaction = transaction.insert(boundary, paragraph.create());
    nextSelection = Selection.findFrom(transaction.doc.resolve(boundary), direction, true);
  }

  if (!nextSelection) return false;

  view.dispatch(transaction.setSelection(nextSelection).scrollIntoView());
  view.focus();
  return true;
}
