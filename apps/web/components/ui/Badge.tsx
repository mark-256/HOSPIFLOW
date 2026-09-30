import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TONE_CLASSES, TONE_DOT_CLASSES, resolveStatus, type StatusRegistry, type StatusTone } from '@/lib/status'

type BadgeTone = StatusTone

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
  icon?: ReactNode
  size?: 'sm' | 'md'
}

export function Badge({ tone = 'neutral', icon, size = 'sm', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[0.8125rem]',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  )
}

export type StatusBadgeProps = {
  /** Raw status value from the API (e.g. "CHECKED_IN"). */
  status?: string | null
  /** Registry that maps the raw value to a label and semantic tone. */
  registry: StatusRegistry
  className?: string
  size?: 'sm' | 'md'
  showDot?: boolean
}

/**
 * The single status presentation used across every HOSPIFLOW module.
 * Unknown statuses render as a neutral badge rather than disappearing.
 */
export function StatusBadge({ status, registry, className, size = 'sm', showDot = true }: StatusBadgeProps) {
  const { label, tone } = resolveStatus(status, registry)
  return (
    <Badge
      tone={tone}
      size={size}
      className={cn('whitespace-nowrap', className)}
      icon={
        showDot ? (
          <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT_CLASSES[tone])} />
        ) : null
      }
    >
      {label}
    </Badge>
  )
}
