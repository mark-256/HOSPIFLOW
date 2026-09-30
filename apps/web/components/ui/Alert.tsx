import type { HTMLAttributes, ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const ALERT_STYLES: Record<AlertTone, { wrapper: string; icon: string }> = {
  info: { wrapper: 'border-info-200 bg-info-50 text-info-800', icon: 'text-info-600' },
  success: { wrapper: 'border-success-200 bg-success-50 text-success-800', icon: 'text-success-600' },
  warning: { wrapper: 'border-warning-200 bg-warning-50 text-warning-800', icon: 'text-warning-600' },
  danger: { wrapper: 'border-danger-200 bg-danger-50 text-danger-800', icon: 'text-danger-600' },
}

const ALERT_ICONS: Record<AlertTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
}

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone
  title?: ReactNode
  onDismiss?: () => void
}

export function Alert({ tone = 'info', title, onDismiss, className, children, ...props }: AlertProps) {
  const styles = ALERT_STYLES[tone]
  const Icon = ALERT_ICONS[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', styles.wrapper, className)}
      {...props}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', styles.icon)} />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-mr-1 -mt-0.5 rounded p-1 text-current opacity-60 transition-opacity duration-150 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
