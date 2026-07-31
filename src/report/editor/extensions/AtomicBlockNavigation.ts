import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * Charts and tables are atomic: they cannot hold a caret. Wherever two of them
 * sit next to each other, or one ends the document, there is a position the
 * caret can reach but nothing to draw a caret in. ProseMirror covers that case
 * with its gap cursor, a stray horizontal bar that looks like a rendering
 * artefact and gives the user nowhere to actually type.
 *
 * Instead of painting a special cursor, we keep the invariant that every such
 * gap holds a real (possibly empty) paragraph. Clicking between two blocks then
 * lands in ordinary text with an ordinary caret, so the gap cursor is disabled
 * in the editor's StarterKit configuration and never has a position to occupy.
 *
 * Those paragraphs are structural rather than authored, so they are painted
 * collapsed until the caret is actually inside one, and Backspace treats them
 * as a step towards the neighbouring block rather than as content to remove.
 */
interface GapPluginState {
  /** The document itself holds DOM focus (not one of a node view's inputs). */
  focused: boolean;
  /**
   * Start position of the one gap paragraph the caret genuinely entered, or
   * null. Only this gap may expand.
   *
   * A gap is "genuinely entered" by clicking its painted strip, by keyboard
   * navigation, or by a programmatic move. It is deliberately *not* entered by
   * the selection reads ProseMirror performs during a mouse press: clicking an
   * atomic block lets the browser park a provisional caret at the nearest
   * editable position — which, between two atomic blocks, is a collapsed gap —
   * and ProseMirror reads that back and dispatches it (with meta `pointer`)
   * before the mouseup resolves the click to a node selection. Expanding on
   * that transient caret is what made every click on a block flash the gap's
   * placeholder underneath it.
   */
  liveGapPos: number | null;
}

type GapPluginMeta =
  | { focus: boolean }
  | 'caret'
  | 'silent';

const gapPluginKey = new PluginKey<GapPluginState>('atomicBlockGaps');

const COLLAPSED_GAP_CLASS = 'is-gap-collapsed';

/**
 * Marks a transaction as one that moves the document selection without the user
 * taking the caret with them.
 *
 * A node view that hands focus to one of its own inputs has to drop the node
 * selection first, and the position it drops it on is usually a structural gap.
 * The editor still holds DOM focus at that moment, so without this the gap
 * would expand and show its placeholder for the one frame between the click and
 * the input taking focus — a flash of empty text somewhere else on the page.
 */
export function withoutCaret(transaction: Transaction): Transaction {
  return transaction
    .setMeta(gapPluginKey, 'silent' satisfies GapPluginMeta)
    .setMeta('addToHistory', false);
}

/** Controls that handle their own keyboard input inside a node view. */
const SELF_MANAGED_INPUT = 'input, textarea, select, [role="dialog"]';

function isAtomicBlock(node: ProseMirrorNode): boolean {
  return node.isBlock && node.isAtom;
}

function isEmptyParagraph(node: ProseMirrorNode, schema: Schema): boolean {
  return node.type === schema.nodes.paragraph && node.content.size === 0;
}

function blockGapTransaction(state: EditorState): Transaction | null {
  const { doc, schema } = state;
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) return null;

  const gaps: number[] = [];
  doc.forEach((child, offset, index) => {
    if (child.isTextblock) return;
    const isLast = index + 1 === doc.childCount;
    // Container blocks such as lists already end in a caret position, so only
    // runs of leaf blocks need a paragraph wedged between them.
    const nextIsAtomic = !isLast && doc.child(index + 1).isAtom;
    if (!isLast && !(child.isAtom && nextIsAtomic)) return;
    gaps.push(offset + child.nodeSize);
  });

  if (gaps.length === 0) return null;

  // Insert back to front so earlier positions stay valid.
  const transaction = state.tr;
  for (let index = gaps.length - 1; index >= 0; index -= 1) {
    transaction.insert(gaps[index], paragraph.create());
  }
  return transaction;
}

/**
 * The gap paragraph the caret sits in, but only if that paragraph is one of
 * the collapsible structural gaps the decorations manage. Mirrors the test in
 * `collapsedGapDecorations` so state and paint cannot disagree.
 */
function caretGapPos(state: EditorState): number | null {
  const { doc, schema, selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if ($from.depth !== 1 || !isEmptyParagraph($from.parent, schema)) return null;

  const index = $from.index(0);
  if (index + 1 === doc.childCount) return null;

  const previous = index > 0 ? doc.child(index - 1) : null;
  if (!previous || !isAtomicBlock(previous)) return null;

  return $from.before(1);
}

/**
 * A structural gap only earns its full writing height while the caret is
 * genuinely in it. Focus is part of that test: clicking into a table cell moves
 * focus to an input outside the document, and the report should not reflow
 * behind it. Genuine entry is the other part: a caret that a mouse press
 * merely parked in the gap (see `liveGapPos`) keeps the gap collapsed.
 */
function collapsedGapDecorations(state: EditorState, plugin: GapPluginState): DecorationSet {
  const { doc, schema, selection } = state;
  const decorations: Decoration[] = [];

  doc.forEach((child, offset, index) => {
    if (!isEmptyParagraph(child, schema)) return;

    const previous = index > 0 ? doc.child(index - 1) : null;
    const isLast = index + 1 === doc.childCount;
    // The paragraph that ends the document is the one users type into next, so
    // it always keeps its normal height.
    if (isLast || !previous || !isAtomicBlock(previous)) return;

    const holdsCaret = plugin.focused
      && plugin.liveGapPos === offset
      && selection.empty
      && selection.from > offset
      && selection.from < offset + child.nodeSize;
    if (holdsCaret) return;

    decorations.push(
      // `contenteditable=false` is the part that makes collapse reliable, not
      // just cosmetic. A collapsed gap is editable DOM next to a non-editable
      // block, so on every click on the block the browser parks a provisional
      // caret in it, and ProseMirror reads that back as a selection change —
      // sometimes too late to be recognized as part of the click. A gap the
      // user cannot see must not be able to receive that caret at all. Every
      // genuine entry (gap strip click, keyboard, programmatic moves) goes
      // through editor state, which expands the gap — removing this attribute
      // — before the view writes the caret to the DOM.
      Decoration.node(offset, offset + child.nodeSize, {
        class: COLLAPSED_GAP_CLASS,
        contenteditable: 'false',
      }),
    );
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * Pixels along each neighbouring block's edge that stay the block's own. Blocks
 * land on fractional layout positions while hit testing happens in whole
 * physical pixels, so the band between two blocks concedes a few pixels at both
 * ends rather than tiling flush with them.
 */
const GAP_EDGE_CLEARANCE = 3;

/** Anything that owns its own clicks, whatever it happens to overlap. */
const OWNS_CLICK = `[data-node-view-wrapper], button, a, ${SELF_MANAGED_INPUT}`;

function blockRect(view: EditorView, pos: number): DOMRect | null {
  const dom = view.nodeDOM(pos);
  return dom instanceof Element ? dom.getBoundingClientRect() : null;
}

/**
 * The collapsed gap a mouse event belongs to, as a document position, or null.
 *
 * The answer is geometric rather than a lookup of the element under the
 * pointer. A collapsed gap is zero pixels tall, so it has no box of its own to
 * be hit, and giving it one — a pseudo-element stretched over the margin it
 * shares with its neighbours — makes the gap the event target for clicks the
 * user aimed at a block: the two boxes meet at a fractional coordinate and the
 * browser rounds it whichever way it likes. That is the last source of a click
 * on a block's bottom edge opening the paragraph underneath it.
 *
 * So the band is measured from the neighbouring blocks instead, in the only
 * terms that cannot disagree with what the user sees: the space *between* their
 * rendered boxes, minus a clearance at each end. A coordinate inside a block —
 * including the row its border is painted in — is by construction not in any
 * band, and belongs to the block.
 */
function collapsedGapAtCoords(view: EditorView, event: MouseEvent): number | null {
  const target = event.target;
  if (target instanceof Element && target.closest(OWNS_CLICK)) return null;

  const editorRect = view.dom.getBoundingClientRect();
  const { clientX: x, clientY: y } = event;
  if (x < editorRect.left || x > editorRect.right) return null;

  const { doc, schema } = view.state;
  let offset = 0;

  for (let index = 0; index < doc.childCount; index += 1) {
    const child = doc.child(index);
    const start = offset;
    offset += child.nodeSize;

    const previous = index > 0 ? doc.child(index - 1) : null;
    const isLast = index + 1 === doc.childCount;
    // Mirrors the test in `collapsedGapDecorations`: only a gap that is
    // painted collapsed needs a hit band of its own.
    if (isLast || !previous || !isAtomicBlock(previous)) continue;
    if (!isEmptyParagraph(child, schema)) continue;

    const above = blockRect(view, start - previous.nodeSize);
    const below = blockRect(view, offset);
    if (!above || !below) continue;

    if (y >= above.bottom + GAP_EDGE_CLEARANCE && y <= below.top - GAP_EDGE_CLEARANCE) {
      return start;
    }
  }

  return null;
}

/**
 * Puts the caret in a collapsed gap that was clicked.
 *
 * This cannot be left to ProseMirror: it resolves a click through
 * `posAtCoords`, and with nothing but a zero-height paragraph at these
 * coordinates the click is awarded to whichever neighbouring block is nearest.
 *
 * Callers run this on mouseUP, never on the press. A click has two halves, and
 * the document must not change between them: opening the gap at mousedown
 * reflows the page under a button that is still held, and whatever the release
 * then lands on becomes a second action from the same click. Resolving once,
 * at release, means every click performs exactly one action — and a click that
 * involves a block in either half is the block's alone.
 */
function focusCollapsedGap(view: EditorView, position: number): void {
  if (view.isDestroyed || position > view.state.doc.content.size) return;

  view.dispatch(
    view.state.tr
      .setSelection(Selection.near(view.state.doc.resolve(position)))
      .setMeta(gapPluginKey, 'caret' satisfies GapPluginMeta),
  );
  // Focus last: the selection transaction already marks this as a genuine
  // caret move, even when the editor was focused and no new focus event fires.
  view.focus();
}

function setEditorFocus(view: EditorView, focused: boolean): void {
  // Unmounting the editor fires a final blur; the view is gone by then.
  if (view.isDestroyed) return;
  if ((gapPluginKey.getState(view.state)?.focused ?? false) === focused) return;
  view.dispatch(
    view.state.tr
      .setMeta(gapPluginKey, { focus: focused } satisfies GapPluginMeta)
      .setMeta('addToHistory', false),
  );
}

/**
 * Removes the selected block. The viewport is deliberately left where it is:
 * holding Backspace to clear a report should consume blocks in place rather
 * than scrolling the page under the user's cursor.
 */
function deleteSelectedAtom(view: EditorView): boolean {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection) || !isAtomicBlock(selection.node)) return false;

  const transaction = view.state.tr.delete(selection.from, selection.to);
  const landing = Math.min(selection.from, transaction.doc.content.size);
  transaction.setSelection(Selection.near(transaction.doc.resolve(landing), -1));
  view.dispatch(transaction);
  return true;
}

/**
 * Backspace in one of the structural gaps selects the neighbouring block
 * instead of deleting the paragraph. Deleting it would only cause the document
 * to recreate it, which is what made held Backspace appear to do nothing.
 */
function selectAdjacentAtom(view: EditorView, direction: -1 | 1): boolean {
  const { state } = view;
  const { doc, schema, selection } = state;
  if (!selection.empty) return false;

  const { $from } = selection;
  if ($from.depth !== 1 || !isEmptyParagraph($from.parent, schema)) return false;

  const siblingIndex = $from.index(0) + direction;
  if (siblingIndex < 0 || siblingIndex >= doc.childCount) return false;

  const sibling = doc.child(siblingIndex);
  if (!isAtomicBlock(sibling)) return false;

  const siblingPos = direction === -1
    ? $from.before(1) - sibling.nodeSize
    : $from.after(1);
  view.dispatch(state.tr.setSelection(NodeSelection.create(doc, siblingPos)));
  return true;
}

export const AtomicBlockNavigation = Extension.create({
  name: 'atomicBlockNavigation',
  priority: 1_000,

  onCreate() {
    const transaction = blockGapTransaction(this.editor.state);
    if (transaction) this.editor.view.dispatch(transaction);
  },

  addProseMirrorPlugins() {
    // Whether a primary-button press that started inside the editor is still
    // in progress. ProseMirror tags a selection it reads back from the DOM
    // with meta `pointer` only when the read happens within 50ms of the press
    // (prosemirror-view's readDOMChange); a click on a heavy block can spend
    // longer than that re-rendering, so the browser's provisional caret then
    // arrives untagged and looks like a deliberate move. The button itself is
    // the deterministic signal, so it is tracked directly.
    let pointerPressed = false;

    // Position of the collapsed gap the current press started in, held until
    // the release decides whether the click really belongs to it. See
    // focusCollapsedGap.
    let pressedGap: number | null = null;

    return [
      new Plugin<GapPluginState>({
        key: gapPluginKey,

        state: {
          init: (): GapPluginState => ({ focused: false, liveGapPos: null }),
          apply: (transaction, previous, _oldState, newState): GapPluginState => {
            let { focused, liveGapPos } = previous;

            if (liveGapPos !== null && transaction.docChanged) {
              const mapped = transaction.mapping.mapResult(liveGapPos);
              liveGapPos = mapped.deleted ? null : mapped.pos;
            }

            const meta = transaction.getMeta(gapPluginKey) as GapPluginMeta | undefined;
            if (meta === 'caret') {
              liveGapPos = caretGapPos(newState);
            } else if (meta === 'silent') {
              liveGapPos = null;
            } else if (meta !== undefined) {
              focused = meta.focus;
            } else if (transaction.selectionSet) {
              const caretGap = caretGapPos(newState);
              if (caretGap === null) {
                liveGapPos = null;
              } else if (transaction.getMeta('pointer') === true || pointerPressed) {
                // ProseMirror reading back the browser's provisional caret
                // mid-press. It may keep an already-open gap open, but must
                // not open one: the mouseup has not said what was clicked yet.
                if (caretGap !== liveGapPos) liveGapPos = null;
              } else {
                liveGapPos = caretGap;
              }
            }

            if (focused === previous.focused && liveGapPos === previous.liveGapPos) {
              return previous;
            }
            return { focused, liveGapPos };
          },
        },

        view(editorView) {
          const beginPress = (event: MouseEvent) => {
            if (event.button === 0) pointerPressed = true;
          };
          const endPress = (event: MouseEvent) => {
            // A click opens the gap only when both of its halves landed on
            // that same gap's strip. A release anywhere else invalidates the
            // press, so one click can never both open a gap and act on a
            // block.
            const gap = pressedGap;
            pressedGap = null;
            pointerPressed = false;
            if (gap === null || event.button !== 0) return;
            if (collapsedGapAtCoords(editorView, event) === gap) {
              focusCollapsedGap(editorView, gap);
            }
          };
          const cancelPress = () => {
            pressedGap = null;
            pointerPressed = false;
          };
          // Capture phase, so the flag is set before ProseMirror or the
          // browser act on the press and cleared before the mouseup's own
          // selection work runs. The press can end anywhere on the page (or
          // as a drag, or with the window losing focus), so the releases are
          // listened for globally.
          editorView.dom.addEventListener('mousedown', beginPress, true);
          window.addEventListener('mouseup', endPress, true);
          window.addEventListener('dragend', cancelPress, true);
          window.addEventListener('blur', cancelPress);
          return {
            destroy() {
              editorView.dom.removeEventListener('mousedown', beginPress, true);
              window.removeEventListener('mouseup', endPress, true);
              window.removeEventListener('dragend', cancelPress, true);
              window.removeEventListener('blur', cancelPress);
            },
          };
        },

        appendTransaction: (_transactions, _oldState, newState) => {
          return blockGapTransaction(newState);
        },

        props: {
          decorations(state) {
            const plugin = gapPluginKey.getState(state) ?? { focused: false, liveGapPos: null };
            return collapsedGapDecorations(state, plugin);
          },

          handleDOMEvents: {
            mousedown: (view, event) => {
              if (event.button !== 0) return false;
              const gap = collapsedGapAtCoords(view, event);
              if (gap === null) return false;
              // Claim the press so neither the browser nor ProseMirror start
              // their own gesture, but do not open the gap yet: the release
              // decides (see endPress in the plugin view).
              event.preventDefault();
              pressedGap = gap;
              return true;
            },
            focus: (view) => {
              setEditorFocus(view, true);
              return false;
            },
            blur: (view) => {
              setEditorFocus(view, false);
              return false;
            },
          },

          handleKeyDown: (view, event) => {
            // Node views embed real form controls. While one of them has focus
            // the keystroke belongs to it, never to the document.
            const target = event.target;
            if (target instanceof Element && target.closest(SELF_MANAGED_INPUT)) {
              if (event.key !== 'Enter') return false;
              // Enter is the one key the document would still act on behind the
              // control's back: the base keymap splits the block holding the
              // selection, so committing a table cell was quietly appending an
              // empty paragraph to the report. Claim it for the control, but
              // only for single-line inputs — a textarea needs its newline.
              return Boolean(target.closest('input'));
            }

            if (event.key === 'Backspace' || event.key === 'Delete') {
              const direction = event.key === 'Backspace' ? -1 : 1;
              if (deleteSelectedAtom(view) || selectAdjacentAtom(view, direction)) {
                event.preventDefault();
                return true;
              }
              return false;
            }

            if (event.key === 'Escape') return moveFromSelectedBlock(view, 1);

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
