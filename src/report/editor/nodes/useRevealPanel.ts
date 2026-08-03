import { useEffect, type RefObject } from 'react';

/** Scroll just far enough to bring a below-block config panel fully into view. */
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
