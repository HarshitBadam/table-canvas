import type { SVGProps } from 'react'
import type { ChartType } from '@/types'

interface ChartTypeIconProps extends SVGProps<SVGSVGElement> {
  type: ChartType
}

export function ChartTypeIcon({ type, className, ...props }: ChartTypeIconProps) {
  switch (type) {
    case 'bar':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" {...props}>
          <rect x="4" y="11" width="4" height="9" rx="1" />
          <rect x="10" y="5" width="4" height="15" rx="1" />
          <rect x="16" y="13" width="4" height="7" rx="1" />
        </svg>
      )
    case 'line':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true" {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4 16 4-5 4 3 8-9" />
        </svg>
      )
    case 'pie':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" {...props}>
          <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z" />
        </svg>
      )
    case 'scatter':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true" {...props}>
          <circle cx="5.5" cy="15" r="1.75" />
          <circle cx="9.5" cy="9.5" r="1.75" />
          <circle cx="13" cy="16" r="1.75" />
          <circle cx="16.5" cy="10.5" r="1.75" />
          <circle cx="18.5" cy="5.5" r="1.75" />
        </svg>
      )
    default:
      return null
  }
}
