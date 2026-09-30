'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { resolveStatus, TONE_BAR_CLASSES, TONE_DOT_CLASSES, type StatusRegistry, type StatusTone } from '@/lib/status'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'

type ChartCardProps = {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  className?: string
  bodyClassName?: string
}

export function ChartCard({
  title,
  description,
  action,
  children,
  loading = false,
  empty = false,
  emptyMessage = 'No data available for this period.',
  className,
  bodyClassName,
}: ChartCardProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle description={description}>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardBody className={cn('flex-1', bodyClassName)}>
        {loading ? (
          <div className="flex h-full min-h-[200px] items-end gap-2" role="status" aria-label={`Loading ${title}`}>
            {[45, 70, 55, 85, 62, 48, 74].map((value, index) => (
              <Skeleton key={index} className="flex-1 rounded-t" style={{ height: `${value}%` }} />
            ))}
          </div>
        ) : empty ? (
          <EmptyState size="icon" title="Nothing to show yet" description={emptyMessage} className="py-8" />
        ) : (
          children
        )}
      </CardBody>
    </Card>
  )
}

type BreakdownItem = { label: string; value: number; tone: StatusTone; hint?: string }

type StatusBreakdownProps = {
  title: string
  description?: string
  items: BreakdownItem[]
  total?: number
  footer?: ReactNode
  className?: string
  onSelect?: (label: string) => void
}

/** Horizontal distribution list used for room / order / payment status mix. */
export function StatusBreakdown({ title, description, items, total, footer, className, onSelect }: StatusBreakdownProps) {
  const sum = total ?? items.reduce((accumulator, item) => accumulator + item.value, 0)
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle description={description}>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <EmptyState size="icon" title="No data yet" description="Records will appear here once available." className="py-6" />
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => {
              const percent = sum > 0 ? (item.value / sum) * 100 : 0
              const interactive = typeof onSelect === 'function'
              const Wrapper = interactive ? 'button' : 'div'
              return (
                <li key={item.label}>
                  <Wrapper
                    {...(interactive
                      ? { type: 'button' as const, onClick: () => onSelect?.(item.label), 'aria-label': `Filter by ${item.label}` }
                      : {})}
                    className={cn(
                      'w-full rounded-md text-left',
                      interactive && 'transition-colors duration-150 hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-500',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT_CLASSES[item.tone])} />
                        <span className="truncate text-sm text-ink-700">{item.label}</span>
                        {item.hint ? <span className="truncate text-xs text-ink-400">{item.hint}</span> : null}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-ink-900">
                        {item.value}
                        <span className="ml-1.5 text-xs font-normal text-ink-400">{percent.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={cn('h-full rounded-full transition-[width] duration-200', TONE_BAR_CLASSES[item.tone])}
                        style={{ width: `${Math.max(percent, item.value > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </Wrapper>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
      {footer ? <div className="border-t border-line px-4 py-3 sm:px-5">{footer}</div> : null}
    </Card>
  )
}

/** Convert API status values into breakdown rows using a semantic registry. */
export function buildBreakdown(
  counts: Array<{ status: string; count: number }>,
  registry: StatusRegistry,
  order?: string[],
): BreakdownItem[] {
  const sorted = [...counts].sort((left, right) => {
    if (order) {
      const leftIndex = order.indexOf(left.status.toUpperCase())
      const rightIndex = order.indexOf(right.status.toUpperCase())
      if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex
      if (leftIndex !== -1) return -1
      if (rightIndex !== -1) return 1
    }
    return right.count - left.count
  })
  return sorted.map((entry) => {
    const resolved = resolveStatus(entry.status, registry)
    return { label: resolved.label, value: entry.count, tone: resolved.tone as StatusTone }
  })
}
