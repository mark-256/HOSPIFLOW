'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AlertTone } from '@/components/ui/Alert'

export type ToastInput = {
  title: string
  description?: string
  tone?: AlertTone
  duration?: number
}

type ToastItem = ToastInput & { id: number }

type ToastContextValue = {
  toast: (input: ToastInput) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_STYLES: Record<AlertTone, { wrapper: string; icon: string; Icon: typeof Info }> = {
  success: { wrapper: 'border-success-200 bg-surface', icon: 'text-success-600', Icon: CheckCircle2 },
  danger: { wrapper: 'border-danger-200 bg-surface', icon: 'text-danger-600', Icon: XCircle },
  warning: { wrapper: 'border-warning-200 bg-surface', icon: 'text-warning-600', Icon: AlertTriangle },
  info: { wrapper: 'border-info-200 bg-surface', icon: 'text-info-600', Icon: Info },
}

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<number, number>>({})

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
    const timer = timers.current[id]
    if (timer) {
      window.clearTimeout(timer)
      delete timers.current[id]
    }
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      toastId += 1
      const id = toastId
      const item: ToastItem = { tone: 'info', duration: 5000, ...input, id }
      setToasts((current) => [...current.slice(-3), item])
      if (item.duration && item.duration > 0) {
        timers.current[id] = window.setTimeout(() => dismiss(id), item.duration)
      }
    },
    [dismiss],
  )

  useEffect(() => {
    const active = timers.current
    return () => {
      Object.values(active).forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      error: (title, description) => toast({ title, description, tone: 'danger', duration: 8000 }),
      warning: (title, description) => toast({ title, description, tone: 'warning' }),
      info: (title, description) => toast({ title, description, tone: 'info' }),
    }),
    [toast, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end sm:p-6"
      >
        {toasts.map((item) => {
          const tone = item.tone || 'info'
          const styles = TONE_STYLES[tone]
          const Icon = styles.Icon
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-fade-in-up items-start gap-3 rounded-lg border px-4 py-3 shadow-md',
                styles.wrapper,
              )}
            >
              <Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', styles.icon)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                {item.description ? <p className="mt-0.5 text-sm text-ink-600">{item.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="-mr-1 -mt-0.5 rounded p-1 text-ink-400 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-700"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    // A no-op fallback keeps components usable outside a provider (e.g. tests).
    return {
      toast: () => undefined,
      success: () => undefined,
      error: () => undefined,
      warning: () => undefined,
      info: () => undefined,
      dismiss: () => undefined,
    }
  }
  return context
}
