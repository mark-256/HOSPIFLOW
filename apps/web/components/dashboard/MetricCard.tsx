'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { TONE_CLASSES, type StatusTone } from '@/lib/status'

type MetricCardProps = {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  /** Secondary line under the value, e.g. "3 arrivals expected". */
  hint?: React.ReactNode
  /** Percentage change against a comparison period. */
  delta?: number | null
  deltaLabel?: string
  tone?: StatusTone
  loading?: boolean
  /** Renders the unavailable state instead of a misleading zero. */
  unavailable?: boolean
  href?: string
  className?: string
}

export default function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  delta,
  deltaLabel = 'vs previous period',
  tone = 'brand',
  loading = false,
  unavailable = false,
  href,
  className,
}: MetricCardProps) {
  if (loading) {
    return (
      <div className={cn('hf-card p-4 sm:p-5', className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-28" />
        <Skeleton className="mt-3 h-3 w-20" />
      </div>
    )
  }

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="hf-overline">{label}</p>
        {Icon ? (
          <span aria-hidden="true" className={cn('flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset', TONE_CLASSES[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="hf-metric mt-2.5">{unavailable ? '--' : value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {typeof delta === 'number' && !unavailable ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
              delta > 0 ? 'text-success-700' : delta < 0 ? 'text-danger-700' : 'text-ink-500',
            )}
          >
            {delta > 0 ? (
              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
            ) : delta < 0 ? (
              <ArrowDownRight aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <Minus aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        ) : null}
        {typeof delta === 'number' && !unavailable ? (
          <span className="text-xs text-ink-500">{deltaLabel}</span>
        ) : null}
        {hint ? <span className="text-xs text-ink-500">{hint}</span> : null}
        {unavailable ? <span className="text-xs text-ink-500">Data unavailable</span> : null}
      </div>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          'hf-card group block p-4 transition-shadow duration-150 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:p-5',
          className,
        )}
      >
        {body}
      </Link>
    )
  }

  return <div className={cn('hf-card p-4 sm:p-5', className)}>{body}</div>
}
