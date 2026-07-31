import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { focusMenuItem } from '@/lib/focusMenuItem';

/** Shared open/close, dismissal and roving-focus wiring for the report toolbar menus. */
export function useToolbarMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [open]);

  /** Closing by keyboard or by picking an item must hand focus back to the trigger. */
  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const handleMenuKeyDown = useCallback((event: ReactKeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
      return;
    }
    focusMenuItem(event, menuRef.current);
  }, [close]);

  const handleTriggerKeyDown = useCallback((event: ReactKeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true);
  }, []);

  return {
    open,
    setOpen,
    close,
    containerRef,
    triggerRef,
    menuRef,
    handleMenuKeyDown,
    handleTriggerKeyDown,
  };
}
