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
 * click-to-select is unreliable inside them: inner scroll containers and React
 * handlers routinely consume the event before it resolves to a node position.
 * Setting the node selection explicitly on mousedown makes every block
 * selectable from anywhere in its body, which is what makes it deletable.
 *
 * Callers attach this on the capture phase. ProseMirror listens for mousedown
 * on the editor root, which is below React's delegated bubble listener. A
 * bubble-phase handler therefore runs only after ProseMirror has recorded a
 * geometry-derived mouseup destination. Preventing the default in capture
 * makes the DOM target authoritative for block chrome and keeps ProseMirror
 * from starting a second gesture for the same press.
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

/** Selects the node this view renders, for callers that have no mouse event. */
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

    // The block is already under the pointer, so focus without scrolling it
    // into view and moving the page underneath the gesture.
    view.focus();
  }, [editor, getPos]);
}

/**
 * Hands the document selection back to the text flow. Node views call this
 * before giving focus to one of their own inputs: typing while the block is
 * still node-selected would replace the whole block.
 *
 * It releases whichever block is selected, not only this one. Entering a grid
 * is the user leaving the previously selected block, and that block cannot
 * release itself: node views swallow their own mouse events, so the click that
 * lands in this grid is never seen by the other block or by ProseMirror's own
 * click-to-select. Scoping this to the caller's own position left the earlier
 * block wearing its selection ring next to a freshly selected cell.
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
