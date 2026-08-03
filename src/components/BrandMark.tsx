import { useId } from 'react'

interface BrandMarkProps {
  className?: string
}

/**
 * Table Canvas mark: a stacked-sheets glyph matching `public/favicon.svg`.
 * Stroke-only and `currentColor`-based so it works on any background
 * (accent-tinted circles, solid tiles, plain text color).
 *
 * The back sheet is clipped by a mask shaped exactly like the front sheet's
 * rounded rect, rather than a hand-traced arc path — that keeps the two
 * strokes perfectly aligned at every render size instead of leaving a seam.
 */
export function BrandMark({ className }: BrandMarkProps) {
  const maskId = useId()

  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={maskId}>
        <rect width="24" height="24" fill="#fff" />
        <rect x="9" y="9" width="10" height="10" rx="1.5" fill="#000" />
      </mask>
      <rect x="5" y="5" width="10" height="10" rx="1.5" strokeWidth={1.6} mask={`url(#${maskId})`} />
      <rect x="9" y="9" width="10" height="10" rx="1.5" strokeWidth={1.6} />
      <path strokeWidth={1.6} d="M14 10v8M10 14h8" />
    </svg>
  )
}
