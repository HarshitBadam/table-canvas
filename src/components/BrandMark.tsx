import { useId } from 'react'

interface BrandMarkProps {
  className?: string
}

/**
 * Stacked-sheets mark matching `public/favicon.svg` (`currentColor` strokes).
 * The back sheet is clipped with a mask of the front rect so the two strokes
 * stay aligned at every size — a hand-traced arc leaves a seam.
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
