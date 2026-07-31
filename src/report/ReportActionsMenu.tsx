import {
  toolbarIconButton,
  toolbarMenuItem,
  toolbarMenuItemDanger,
  toolbarMenuItemNeutral,
  toolbarMenuSurface,
} from './toolbarStyles';
import { useToolbarMenu } from './useToolbarMenu';

interface ReportActionsMenuProps {
  /** Applied to the actions that mutate the report; export stays available read-only. */
  blocked: { disabled?: boolean; title?: string };
  isExporting: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

const neutralItem = `${toolbarMenuItem} ${toolbarMenuItemNeutral} min-h-10 items-center text-sm`;
const dangerItem = `${toolbarMenuItem} ${toolbarMenuItemDanger} min-h-10 items-center text-sm`;
const neutralIcon = 'h-4 w-4 shrink-0 text-text-tertiary';

/**
 * Document-scoped verbs live behind one affordance next to the report name, so the
 * toolbar's remaining icons all act on the content rather than on the report itself.
 */
export function ReportActionsMenu({
  blocked,
  isExporting,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: ReportActionsMenuProps) {
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

  const run = (action: () => void) => {
    action();
    close();
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Report actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Report actions"
        onClick={() => setOpen(value => !value)}
        onKeyDown={handleTriggerKeyDown}
        className={`${toolbarIconButton} ${open ? 'bg-surface-secondary text-text-primary' : ''}`}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Report actions"
          onKeyDown={handleMenuKeyDown}
          className={`${toolbarMenuSurface} left-0 w-[13rem]`}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => run(onRename)}
            className={neutralItem}
            {...blocked}
          >
            <svg className={neutralIcon} viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12.5 4.5l3 3M4 16l.75-3 8.5-8.5a1.4 1.4 0 012 2L6.75 15 4 16z" />
            </svg>
            <span className="min-w-0 flex-1 truncate">Rename</span>
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => run(onDuplicate)}
            className={neutralItem}
            {...blocked}
          >
            <svg className={neutralIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 8h11v11H8zM5 16H4V5h11v1" />
            </svg>
            <span className="min-w-0 flex-1 truncate">Duplicate</span>
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={isExporting}
            onClick={() => run(onExport)}
            className={neutralItem}
          >
            <svg className={neutralIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="min-w-0 flex-1 truncate">
              {isExporting ? 'Exporting…' : 'Export as PDF'}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => run(onDelete)}
            className={dangerItem}
            {...blocked}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
            </svg>
            <span className="min-w-0 flex-1 truncate">Delete report</span>
          </button>
        </div>
      )}
    </div>
  );
}
