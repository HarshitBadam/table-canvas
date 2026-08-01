/** Shared look for the flat report toolbar: ghost icon buttons and hairline dividers. */

export const toolbarIconButton = 'box-border flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-green disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:h-8 sm:w-8';

export const toolbarIconButtonActive = 'bg-accent-green/10 text-accent-text hover:bg-accent-green/15 hover:text-accent-text';

export const toolbarDanger = 'hover:bg-error/10 hover:text-error-text';

export const toolbarDivider = 'ml-2.5 mr-1.5 h-6 w-px shrink-0 bg-border-subtle';

/** Labelled dropdown trigger — reads as a control, not as one more ghost icon. */
export const toolbarTriggerChip = 'box-border flex h-9 shrink-0 items-center gap-1.5 rounded-md border-0 bg-surface-secondary px-2.5 text-xs font-medium text-text-primary outline-none transition-colors hover:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-accent-green disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-secondary sm:h-8';

/**
 * Menu surface. `overflow-hidden` plus zero padding is what lets a row's hover fill
 * flush to every edge: the first and last rows are clipped by the radius instead of
 * floating inside a padded box, so no pale strip is left at the top or bottom.
 */
export const toolbarMenuSurface = 'absolute top-[calc(100%+0.375rem)] z-popover overflow-hidden rounded-xl border border-border bg-surface shadow-lg motion-safe:animate-scale-in';

/** Rows use their focus background rather than a competing inset border. */
const toolbarMenuItemBase = 'group flex w-full gap-2.5 px-3 py-2 text-left outline-none transition-colors disabled:opacity-40';

/** A disabled row is normally a refused one, so it carries the not-allowed cursor. */
export const toolbarMenuItem = `${toolbarMenuItemBase} disabled:cursor-not-allowed`;

/**
 * For a row that is disabled only because its own action is still running: the verb is
 * allowed, so refusing the pointer would misread. The not-allowed class is omitted rather
 * than overridden — Tailwind emits `cursor-not-allowed` after `cursor-default`, so a
 * later class in the attribute would lose.
 */
export const toolbarMenuItemBusy = toolbarMenuItemBase;

export const toolbarMenuItemNeutral = 'text-text-primary hover:bg-surface-secondary focus-visible:bg-surface-secondary disabled:hover:bg-transparent';

/** A wash rather than a fill: enough to read as destructive without flooding the menu. */
export const toolbarMenuItemDanger = 'text-error-text hover:bg-error/[0.06] focus-visible:bg-error/[0.06] disabled:hover:bg-transparent';
