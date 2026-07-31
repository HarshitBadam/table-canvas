import { useEffect, type RefObject } from 'react';

/**
 * Config panels render below their block. Scroll only as far as it takes to
 * bring the panel fully into view while retaining a small gap below it. Aligning
 * to the panel's end avoids leaving its footer flush with the viewport edge.
 */
export function useRevealPanel(panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const frame = window.requestAnimationFrame(() => {
      panel.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [panelRef]);
}
