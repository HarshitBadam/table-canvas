import type { ChartType } from '@/types'

export function ChartTypeIcon({ type, className }: { type: ChartType; className?: string }) {
  switch (type) {
    case 'bar':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z" />
        </svg>
      )
    case 'line':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 4 4 6-6" />
        </svg>
      )
    case 'pie':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2.03 0v8.99H22c-.47-4.74-4.24-8.52-8.97-8.99zm0 11.01V22c4.74-.47 8.5-4.25 8.97-8.99h-8.97z" />
        </svg>
      )
    case 'scatter':
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24">
          <circle cx="7" cy="14" r="2" />
          <circle cx="11" cy="10" r="2" />
          <circle cx="15" cy="16" r="2" />
          <circle cx="17" cy="8" r="2" />
        </svg>
      )
    default:
      return null
  }
}
