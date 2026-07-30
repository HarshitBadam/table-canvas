/**
 * A table's body is wall-to-wall cells, and every cell claims its own click so
 * it can be edited. That leaves the block itself with no surface to grab, so it
 * gets an explicit handle on the outer edge: the one place a click always means
 * "select the whole table". It is drawn as a row of dots because that is the
 * conventional shape for a handle; the label says what it does, since a mark
 * beside a table has no other way to explain itself.
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
      {/*
        Dots rather than a bar: a solid rule beside the table reads as part of
        the table's own frame, which made it look like a stray border.
      */}
      <svg viewBox="0 0 4 16" fill="currentColor" aria-hidden="true">
        <circle cx="2" cy="2" r="1.5" />
        <circle cx="2" cy="8" r="1.5" />
        <circle cx="2" cy="14" r="1.5" />
      </svg>
    </button>
  );
}
