'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, RefreshCw, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from './Button'

const SIZE_CLASSES = {
  icon: 'h-10 w-10',
  lg: 'h-12 w-12',
}

type EmptyStateProps = {
  title: string
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
  size?: 'icon' | 'lg'
}

export function EmptyState({ title, description, icon, action, className, size = 'lg' }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'mb-4 flex items-center justify-center rounded-lg bg-ink-100 text-ink-500',
          SIZE_CLASSES[size],
        )}
      >
        {icon || <Inbox className="h-5 w-5" />}
      </span>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  )
}

type ErrorStateProps = {
  title?: string
  message?: string | null
  onRetry?: () => void
  retryLabel?: string
  className?: string
  compact?: boolean
}

/**
 * Friendly failure surface. Never renders stack traces or internal error text
 * beyond what the API returned as a user-facing message.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-lg border border-danger-200 bg-danger-50 text-danger-800',
        compact ? 'items-center px-4 py-3' : 'items-start px-5 py-4',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className={cn('shrink-0 text-danger-600', compact ? 'h-4 w-4' : 'mt-0.5 h-5 w-5')} />
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold', compact ? 'text-sm' : 'text-sm')}>{title}</p>
        {message ? <p className="mt-1 text-sm text-danger-700">{message}</p> : null}
        {onRetry ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-danger-300 bg-surface text-danger-700 hover:bg-danger-100"
            onClick={onRetry}
            leadingIcon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
          >
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

type NoResultsProps = {
  query?: string
  onClear?: () => void
  className?: string
}

/** Distinct from EmptyState: the data exists, the filter matched nothing. */
export function NoResultsState({ query, onClear, className }: NoResultsProps) {
  return (
    <EmptyState
      size="icon"
      icon={<SearchX className="h-5 w-5" />}
      title="No matching results"
      description={
        query ? (
          <>
            Nothing matched <span className="font-medium text-ink-700">{query}</span>. Try a different search or
            clear the filters.
          </>
        ) : (
          'No records match the current filters.'
        )
      }
      action={
        onClear ? (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        ) : null
      }
      className={className}
    />
  )
}
