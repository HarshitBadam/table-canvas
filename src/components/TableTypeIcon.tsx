import type { SVGProps } from 'react'

export function TableTypeIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
      {...props}
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path strokeLinecap="round" d="M4 9h16M9 9v11" />
    </svg>
  )
}
