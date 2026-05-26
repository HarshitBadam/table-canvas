export function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div 
      className="bg-surface rounded-lg border border-border p-4 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-surface-secondary rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-surface-secondary rounded w-3/4" />
          <div className="h-3 bg-surface-secondary rounded w-1/2" />
        </div>
      </div>
    </div>
  )
}
