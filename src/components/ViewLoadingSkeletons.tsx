const widths = ['w-3/4', 'w-1/2', 'w-4/5', 'w-2/3'] as const

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-surface-tertiary ${className}`} />
}

export function TableViewLoadingSkeleton({
  tableName = 'Table',
  isDerived = false,
}: {
  tableName?: string
  isDerived?: boolean
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface"
      role="status"
      aria-label={isDerived ? 'Computing table' : 'Loading table'}
      aria-busy="true"
    >
      <span className="sr-only">{isDerived ? 'Computing table data…' : 'Loading table data…'}</span>
      <div className="flex h-toolbar shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <span className="truncate text-sm font-medium text-text-secondary">{tableName}</span>
        <SkeletonBlock className="h-5 w-16" />
        <div className="flex-1" />
        <SkeletonBlock className="h-8 w-24" />
        <SkeletonBlock className="h-8 w-8" />
        <SkeletonBlock className="h-8 w-20" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden animate-pulse">
        <div className="flex h-9 border-b border-border bg-surface-secondary/60">
          <div className="w-12 shrink-0 border-r border-border-subtle" />
          {[0, 1, 2, 3, 4].map(column => (
            <div
              key={column}
              className="flex min-w-36 flex-1 items-center border-r border-border-subtle px-3"
            >
              <SkeletonBlock className={`h-3 ${widths[column % widths.length]}`} />
            </div>
          ))}
        </div>
        {Array.from({ length: 14 }, (_, row) => (
          <div
            key={row}
            className={`flex h-row border-b border-border-subtle ${
              row % 2 === 0 ? 'bg-surface' : 'bg-surface-secondary/30'
            }`}
          >
            <div className="flex w-12 shrink-0 items-center justify-center border-r border-border-subtle">
              <SkeletonBlock className="h-3 w-3" />
            </div>
            {[0, 1, 2, 3, 4].map(column => (
              <div
                key={column}
                className="flex min-w-36 flex-1 items-center border-r border-border-subtle px-3"
              >
                <SkeletonBlock className={`h-3 ${widths[(row + column) % widths.length]}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartDataLoadingSkeleton() {
  const bars = [42, 66, 50, 82, 58, 74, 46, 88]

  return (
    <div
      className="relative h-[420px] overflow-hidden animate-pulse"
      role="status"
      aria-label="Loading chart data"
      aria-busy="true"
    >
      <span className="sr-only">Loading chart data…</span>
      <div className="absolute bottom-10 left-12 top-5 w-px bg-border-subtle" />
      <div className="absolute bottom-10 left-12 right-5 h-px bg-border-subtle" />
      {[25, 50, 75].map(position => (
        <div
          key={position}
          className="absolute left-12 right-5 border-t border-dashed border-border-subtle"
          style={{ bottom: `${position}%` }}
        />
      ))}
      <div className="absolute bottom-10 left-16 right-7 top-6 flex items-end justify-around gap-3">
        {bars.map((height, index) => (
          <div key={index} className="flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-surface-tertiary"
              style={{ height: `${height}%` }}
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-2 left-16 right-7 flex justify-around gap-3">
        {bars.map((_, index) => (
          <SkeletonBlock key={index} className="h-2.5 flex-1" />
        ))}
      </div>
    </div>
  )
}

export function ChartViewLoadingSkeleton() {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-6">
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex h-[73px] items-center justify-between border-b border-border-subtle px-3 sm:px-5">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-10 w-10 rounded-lg" />
              <SkeletonBlock className="h-5 w-40" />
            </div>
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-9 w-40" />
              <SkeletonBlock className="h-3 w-12" />
            </div>
          </div>
          <div className="p-2 sm:p-6">
            <ChartDataLoadingSkeleton />
          </div>
        </div>
        <div className="h-32 animate-pulse rounded-lg border border-border bg-surface p-5">
          <SkeletonBlock className="mb-3 h-4 w-28" />
          <SkeletonBlock className="h-9 w-full" />
        </div>
      </div>
    </div>
  )
}
