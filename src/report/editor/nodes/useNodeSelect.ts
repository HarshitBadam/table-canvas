import { useCallback } from 'react';
import type { NodeViewProps } from '@tiptap/react';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { withoutCaret } from '../extensions/AtomicBlockNavigation';

/**
 * Elements that own the click themselves. Selecting the block on top of them
 * would steal focus from a control the user is deliberately operating.
 */
const INTERACTIVE = 'button, input, textarea, select, a, [role="dialog"], [contenteditable="true"]';

/**
 * Atomic block node views render their own DOM, so ProseMirror's built-in
 * click-to-select is unreliable inside them. Set the node selection explicitly
 * on capture-phase mousedown: ProseMirror listens on the editor root below
 * React's delegated bubble listener, so a bubble handler runs only after PM has
 * already recorded a geometry-derived mouseup destination.
 *
 * @param exemptSelector extra CSS selector whose subtree keeps its own click
 *   handling, e.g. the editable cells of a grid.
 */
export function useNodeSelect(
  editor: NodeViewProps['editor'],
  getPos: NodeViewProps['getPos'],
  exemptSelector?: string,
) {
  const selectNode = useSelectNode(editor, getPos);

  return useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;

      const { target } = event;
      if (target instanceof Element) {
        if (target.closest(INTERACTIVE)) return;
        if (exemptSelector && target.closest(exemptSelector)) return;
      }

      event.preventDefault();
      selectNode();
    },
    [exemptSelector, selectNode],
  );
}

export function useSelectNode(
  editor: NodeViewProps['editor'],
  getPos: NodeViewProps['getPos'],
) {
  return useCallback(() => {
    const position = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof position !== 'number') return;
    const { state, view } = editor;
    const selection = NodeSelection.create(state.doc, position);

    // Commit the destination before focusing the DOM. TipTap's focus command
    // focuses synchronously on Safari before the rest of a command chain is
    // dispatched. If the old selection sits in a structural gap, that focus
    // expands the gap and paints its slash placeholder for one frame before
    // setNodeSelection collapses it again.
    if (!state.selection.eq(selection)) {
      view.dispatch(state.tr.setSelection(selection));
    }

    // Block is already under the pointer — focus without scrolling the page.
    view.focus();
  }, [editor, getPos]);
}

/**
 * Release any node selection before focusing an inner input: typing while the
 * block is still node-selected would replace the whole block.
 *
 * Releases whichever block is selected, not only this one. Entering a grid
 * leaves the previously selected block, and that block cannot release itself —
 * node views swallow their own mouse events, so the click never reaches the
 * other block or ProseMirror's click-to-select.
 */
export function useReleaseNodeSelection(editor: NodeViewProps['editor']) {
  return useCallback(() => {
    const { state } = editor;
    const { selection } = state;
    if (!(selection instanceof NodeSelection)) return;

    const after = Math.min(selection.to, state.doc.content.size);
    editor.view.dispatch(
      withoutCaret(state.tr.setSelection(Selection.near(state.doc.resolve(after), 1))),
    );
  }, [editor]);
}
