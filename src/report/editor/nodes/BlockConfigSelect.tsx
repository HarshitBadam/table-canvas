import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface BlockConfigOption {
  value: string;
  label: string;
  meta?: string;
}

interface BlockConfigSelectProps {
  value: string;
  options: BlockConfigOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const VIEWPORT_GUTTER = 8;
const POPUP_GAP = 6;
const FALLBACK_POPUP_HEIGHT = 240;

export function BlockConfigSelect({
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  ariaLabel,
  disabled,
  open: controlledOpen,
  onOpenChange,
}: BlockConfigSelectProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0, width: 0 });
  const selected = options.find((option) => option.value === value);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback((nextOpen: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [controlledOpen, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const isInsideSelect = (target: Node) =>
      rootRef.current?.contains(target) || popupRef.current?.contains(target);
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!isInsideSelect(target)) {
        setOpen(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && !isInsideSelect(target)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [open, setOpen]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(rect.width, window.innerWidth - VIEWPORT_GUTTER * 2);
      const popupHeight = popupRef.current?.getBoundingClientRect().height || FALLBACK_POPUP_HEIGHT;
      const spaceBelow = window.innerHeight - rect.bottom - POPUP_GAP - VIEWPORT_GUTTER;
      const spaceAbove = rect.top - POPUP_GAP - VIEWPORT_GUTTER;
      const openAbove = spaceBelow < popupHeight && spaceAbove > spaceBelow;
      const preferredTop = openAbove
        ? rect.top - popupHeight - POPUP_GAP
        : rect.bottom + POPUP_GAP;
      const maxTop = Math.max(VIEWPORT_GUTTER, window.innerHeight - popupHeight - VIEWPORT_GUTTER);
      setPopupPosition({
        left: Math.min(
          Math.max(VIEWPORT_GUTTER, rect.left),
          window.innerWidth - width - VIEWPORT_GUTTER,
        ),
        top: Math.min(Math.max(VIEWPORT_GUTTER, preferredTop), maxTop),
        width,
      });
    };
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, options, value]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectOption = (optionValue: string) => {
    onChange(optionValue);
    close(true);
  };

  const moveActive = (direction: 1 | -1) => {
    if (options.length === 0) return;
    setActiveIndex((current) => (current + direction + options.length) % options.length);
  };

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }
    if (event.key === 'Enter' && options.length > 0) {
      event.preventDefault();
      selectOption(options[activeIndex]?.value ?? options[0].value);
    }
  };

  return (
    <div ref={rootRef} className="block-config-select">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          }
          if (event.key === ' ' && !open) {
            event.preventDefault();
            setOpen(true);
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (open) moveActive(event.key === 'ArrowDown' ? 1 : -1);
            else setOpen(true);
            return;
          }
          if (event.key === 'Enter' && open && options.length > 0) {
            event.preventDefault();
            selectOption(options[activeIndex]?.value ?? options[0].value);
          }
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        className="block-config-select-btn"
      >
        {selected ? (
          <>
            <span className="block-config-select-value">{selected.label}</span>
            {selected.meta && <span className="block-config-select-meta">{selected.meta}</span>}
          </>
        ) : (
          <span className="block-config-select-placeholder">{placeholder}</span>
        )}
        <svg className="block-config-select-arrow" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          className="block-config-select-popup"
          style={{
            position: 'fixed',
            left: popupPosition.left,
            top: popupPosition.top,
            width: popupPosition.width,
          }}
        >
          <div id={listboxId} className="block-config-select-list" role="listbox" aria-label={ariaLabel}>
            {options.map((option, index) => (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => selectOption(option.value)}
                onMouseEnter={() => setActiveIndex(index)}
                onKeyDown={handleListKeyDown}
                className={`block-config-select-option ${value === option.value ? 'selected' : ''} ${activeIndex === index ? 'active' : ''}`}
              >
                <span className="block-config-select-option-name">{option.label}</span>
                {option.meta && <span className="block-config-select-option-meta">{option.meta}</span>}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
