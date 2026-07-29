import { useEffect, useRef, useState } from 'react';
import { focusMenuItem } from '@/lib/focusMenuItem';

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3';

const options: Array<{ value: BlockType; label: string; className: string }> = [
  { value: 'paragraph', label: 'Text', className: 'text-sm' },
  { value: 'h1', label: 'Heading 1', className: 'text-base font-semibold' },
  { value: 'h2', label: 'Heading 2', className: 'text-sm font-semibold' },
  { value: 'h3', label: 'Heading 3', className: 'text-sm font-medium' },
];

interface ReportBlockTypeMenuProps {
  value: BlockType;
  disabled?: boolean;
  title?: string;
  onChange: (value: BlockType) => void;
}

export function ReportBlockTypeMenu({ value, disabled, title, onChange }: ReportBlockTypeMenuProps) {
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
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    const checked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();
  }, [open]);

  const activeLabel = options.find(option => option.value === value)?.label ?? 'Text';

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Text style"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        onClick={() => setOpen(current => !current)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          setOpen(true);
        }}
        className="flex h-9 w-[7.5rem] items-center gap-1.5 rounded-md border-0 bg-surface-secondary px-2.5 text-left text-xs font-medium text-text-primary outline-none transition-colors hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-accent-green disabled:cursor-not-allowed disabled:opacity-40 sm:h-8"
      >
        <span className="min-w-0 flex-1 truncate">{activeLabel}</span>
        <svg className="h-3.5 w-3.5 shrink-0 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Text style"
          className="absolute left-0 top-[calc(100%+0.375rem)] z-popover w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-lg motion-safe:animate-scale-in"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              window.requestAnimationFrame(() => triggerRef.current?.focus());
              return;
            }
            focusMenuItem(event, menuRef.current);
          }}
        >
          {options.map(option => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                tabIndex={-1}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex min-h-10 w-full items-center px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-green ${
                  active ? 'bg-accent-green/10 text-accent-text' : 'text-text-primary hover:bg-surface-secondary'
                }`}
              >
                <span className={`min-w-0 flex-1 truncate ${option.className}`}>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
