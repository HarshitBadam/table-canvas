import { LoadingSpinner } from '@/layout/LoadingSpinner';
import {
  toolbarIconButton,
  toolbarMenuItem,
  toolbarMenuItemBusy,
  toolbarMenuItemDanger,
  toolbarMenuItemNeutral,
  toolbarMenuSurface,
} from './toolbarStyles';
import { useToolbarMenu } from './useToolbarMenu';

interface ReportActionsMenuProps {
  /** Applied to the actions that mutate the report; export stays available read-only. */
  blocked: { disabled?: boolean; title?: string };
  /** The format currently exporting, or null when idle. */
  exporting: 'pdf' | 'html' | null;
  onRename: () => void;
  onDuplicate: () => void;
  onExportPdf: () => void;
  onExportHtml: () => void;
  onDelete: () => void;
}

const itemLayout = 'min-h-10 items-center text-sm';
const neutralItem = `${toolbarMenuItem} ${toolbarMenuItemNeutral} ${itemLayout}`;
const busyNeutralItem = `${toolbarMenuItemBusy} ${toolbarMenuItemNeutral} ${itemLayout}`;
const dangerItem = `${toolbarMenuItem} ${toolbarMenuItemDanger} ${itemLayout}`;
const neutralIcon = 'h-4 w-4 shrink-0 text-text-tertiary';

/**
 * Takes the leading icon's slot so a running row keeps its height and label width; the
 * label already carries the state, so the spinner stays out of the accessibility tree.
 */
function ItemSpinner() {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-tertiary" aria-hidden="true">
      <LoadingSpinner size="sm" className="shrink-0" />
    </span>
  );
}

export function ReportActionsMenu({
  blocked,
  exporting,
  onRename,
  onDuplicate,
  onExportPdf,
  onExportHtml,
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
          className={`${toolbarMenuSurface} left-0 w-[min(13rem,calc(100vw-1rem))]`}
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
            disabled={exporting !== null}
            aria-busy={exporting === 'pdf'}
            onClick={() => run(onExportPdf)}
            className={exporting !== null ? busyNeutralItem : neutralItem}
          >
            {exporting === 'pdf' ? (
              <ItemSpinner />
            ) : (
              <svg className={neutralIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            <span className="min-w-0 flex-1 truncate">
              {exporting === 'pdf' ? 'Preparing…' : 'Export as PDF'}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={exporting !== null}
            aria-busy={exporting === 'html'}
            onClick={() => run(onExportHtml)}
            className={exporting !== null ? busyNeutralItem : neutralItem}
          >
            {exporting === 'html' ? (
              <ItemSpinner />
            ) : (
              <svg className={neutralIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9L6 12l3 3m6-6l3 3-3 3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
            <span className="min-w-0 flex-1 truncate">
              {exporting === 'html' ? 'Exporting…' : 'Export as HTML'}
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
