'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import Button from './Button'

type PaginationProps = {
  page: number
  limit: number
  total?: number
  totalPages?: number
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
  className?: string
  itemLabel?: string
}

const LIMIT_OPTIONS = [25, 50, 100]

/** Pager for list endpoints that already return pagination metadata. */
export function Pagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
  className,
  itemLabel = 'records',
}: PaginationProps) {
  const pages = totalPages ?? (total ? Math.max(1, Math.ceil(total / limit)) : 1)
  if (pages <= 1 && !onLimitChange) return null

  const first = total === undefined ? 0 : (page - 1) * limit + 1
  const last = total === undefined ? 0 : Math.min(page * limit, total)

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row sm:px-5',
        className,
      )}
    >
      <p className="hf-caption tabular-nums">
        {total === undefined
          ? `Page ${formatNumber(page)} of ${formatNumber(pages)}`
          : `${formatNumber(first)}-${formatNumber(last)} of ${formatNumber(total)} ${itemLabel}`}
      </p>
      <div className="flex items-center gap-2">
        {onLimitChange ? (
          <label className="hidden items-center gap-1.5 sm:flex">
            <span className="hf-caption">Rows</span>
            <select
              value={limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              className="h-8 cursor-pointer rounded-md border border-line-strong bg-surface pl-2 pr-7 text-xs text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Rows per page"
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Button>
          <span className="hf-caption px-1 tabular-nums">
            {formatNumber(page)} / {formatNumber(pages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(pages, page + 1))}
            disabled={page >= pages}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  )
}
