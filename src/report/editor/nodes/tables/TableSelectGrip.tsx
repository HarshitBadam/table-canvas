/**
 * Cells claim their own clicks for editing, so the block needs an explicit
 * edge handle — the one place a click always means "select the whole table".
 */
export function TableSelectGrip({ onSelect }: { onSelect: () => void }) {
  return (
    <button
      type="button"
      className="table-select-grip"
      title="Select table"
      aria-label="Select table"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
    >
      <svg viewBox="0 0 4 16" fill="currentColor" aria-hidden="true">
        <circle cx="2" cy="2" r="1.5" />
        <circle cx="2" cy="8" r="1.5" />
        <circle cx="2" cy="14" r="1.5" />
      </svg>
    </button>
  );
}
