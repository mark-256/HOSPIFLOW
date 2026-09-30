import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('hf-skeleton', className)} {...props} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/** KPI / metric placeholder. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('hf-card p-4 sm:p-5', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  )
}

export function SkeletonStatGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn('grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}
      role="status"
      aria-label="Loading metrics"
    >
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 6, columns = 5, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn('hf-card overflow-hidden', className)} role="status" aria-label="Loading table">
      <div className="border-b border-line bg-surface-sunken px-4 py-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-3', columnIndex === 0 ? 'w-24' : 'flex-1')}
                style={{ maxWidth: columnIndex === 0 ? 96 : undefined }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonChart({ height = 240, className }: { height?: number; className?: string }) {
  return (
    <div
      className={cn('hf-card p-5', className)}
      role="status"
      aria-label="Loading chart"
      style={{ minHeight: height }}
    >
      <Skeleton className="h-3 w-28" />
      <div className="mt-6 flex items-end gap-2" style={{ height: height - 100 }}>
        {[40, 65, 50, 80, 60, 45, 70].map((value, index) => (
          <Skeleton key={index} className="flex-1 rounded-t" style={{ height: `${value}%` }} />
        ))}
      </div>
    </div>
  )
}
