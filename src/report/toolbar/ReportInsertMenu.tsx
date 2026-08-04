import type { ReactNode } from 'react';
import {
  toolbarMenuItem,
  toolbarMenuItemNeutral,
  toolbarMenuSurface,
  toolbarTriggerChip,
} from './toolbarStyles';
import { useToolbarMenu } from './useToolbarMenu';

interface ReportInsertMenuProps {
  blocked: { disabled?: boolean; title?: string };
  onInsertEmbeddedTable?: () => void;
  onInsertChart?: () => void;
  onInsertTable?: () => void;
}

interface InsertOption {
  label: string;
  description: string;
  icon: ReactNode;
  onSelect: () => void;
}

const insertItem = `${toolbarMenuItem} ${toolbarMenuItemNeutral} items-start py-2.5`;

/**
 * The two table icons differ by a single glyph detail, so the distinction between a
 * linked and a manual table is carried by written labels rather than by a tooltip.
 */
export function ReportInsertMenu({
  blocked,
  onInsertEmbeddedTable,
  onInsertChart,
  onInsertTable,
}: ReportInsertMenuProps) {
  const {
    open,
    setOpen,
    close,
    containerRef,
    triggerRef,
    menuRef,
    handleMenuKeyDown,
    handleTriggerKeyDown,
  } = useToolbarMenu();

  const options: InsertOption[] = [];

  if (onInsertEmbeddedTable) {
    options.push({
      label: 'Linked table',
      description: 'Live excerpt from project data',
      onSelect: onInsertEmbeddedTable,
      icon: (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 6h16v12H4zM4 10h16M10 10v8" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M16 3.5a2 2 0 100 4 2 2 0 000-4z" />
        </>
      ),
    });
  }

  if (onInsertChart) {
    options.push({
      label: 'Chart',
      description: 'Visualize a project table',
      onSelect: onInsertChart,
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 20V10m7 10V4m7 16v-7" />,
    });
  }

  if (onInsertTable) {
    options.push({
      label: 'Manual table',
      description: 'Small editable table in this report',
      onSelect: onInsertTable,
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14" />,
    });
  }

  if (options.length === 0) return null;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        onKeyDown={handleTriggerKeyDown}
        className={`${toolbarTriggerChip} ${open ? 'bg-surface-tertiary' : ''}`}
        {...blocked}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeWidth={2.25} d="M12 5v14M5 12h14" />
        </svg>
        <span>Insert</span>
        <svg className="h-3.5 w-3.5 shrink-0 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Insert block"
          onKeyDown={handleMenuKeyDown}
          className={`${toolbarMenuSurface} right-0 w-[min(17rem,calc(100vw-1rem))]`}
        >
          {options.map(option => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                option.onSelect();
                close();
              }}
              className={insertItem}
            >
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary transition-colors group-hover:text-text-secondary"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                {option.icon}
              </svg>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-text-tertiary">{option.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
