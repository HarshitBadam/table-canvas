/**
 * The arrowheads that extend a table by a column or a row. Both are equilateral
 * triangles (base 21, height 21 * sin(60deg)) drawn tight to the viewBox, so
 * the button box is the triangle and its flat edge can be placed exactly on the
 * table's border rather than a stray pixel or two away from it.
 */
export function TableAddIcon({ direction }: { direction: 'right' | 'down' }) {
  return direction === 'right' ? (
    <svg viewBox="0 0 18.19 21" fill="currentColor" aria-hidden="true">
      <path d="M0 0 18.19 10.5 0 21z" />
    </svg>
  ) : (
    <svg viewBox="0 0 21 18.19" fill="currentColor" aria-hidden="true">
      <path d="M0 0h21L10.5 18.19z" />
    </svg>
  );
}
