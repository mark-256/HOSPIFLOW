'use client'

import { forwardRef, useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { AlertCircle, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const CONTROL_BASE =
  'block w-full rounded-md border bg-surface text-sm text-ink-800 placeholder:text-ink-400 transition-colors duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-0 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-400'

const CONTROL_TONE = (invalid?: boolean) =>
  invalid
    ? 'border-danger-400 focus:border-danger-500 focus-visible:ring-danger-400'
    : 'border-line-strong hover:border-ink-300 focus:border-brand-500'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
  leadingSlot?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leadingSlot, ...props },
  ref,
) {
  if (leadingSlot) {
    return (
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        >
          {leadingSlot}
        </span>
        <input
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(CONTROL_BASE, CONTROL_TONE(invalid), 'h-9 pl-9 pr-3', className)}
          {...props}
        />
      </div>
    )
  }
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, CONTROL_TONE(invalid), 'h-9 px-3', className)}
      {...props}
    />
  )
})

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, CONTROL_TONE(invalid), 'resize-y px-3 py-2 leading-6', className)}
      {...props}
    />
  )
})

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          CONTROL_TONE(invalid),
          'h-9 cursor-pointer appearance-none pl-3 pr-9',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
      />
    </div>
  )
})

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  description?: ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, id, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id || generatedId
  return (
    <div className="flex items-start gap-2.5">
      <span className="relative flex h-9 items-center">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className={cn(
            'peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-line-strong bg-surface text-brand-600 transition-colors duration-150',
            'checked:border-brand-600 checked:bg-brand-600',
            'checked:bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\' fill=\'none\' stroke=\'white\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M3.5 8.5l3 3 6-6\'/%3E%3C/svg%3E")] checked:bg-center checked:bg-no-repeat',
            'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:bg-ink-100',
            className,
          )}
          {...props}
        />
      </span>
      <span className="min-w-0">
        <label htmlFor={inputId} className="cursor-pointer text-sm font-medium text-ink-800">
          {label}
        </label>
        {description ? <span className="mt-0.5 block text-xs text-ink-500">{description}</span> : null}
      </span>
    </div>
  )
})

export type FieldProps = {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}

/** Label + control + hint/error, with accessible wiring. */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="hf-label mb-1.5 block">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-start gap-1 text-xs text-danger-700">
          <AlertCircle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  )
}

/** Standard responsive form grid. */
export function FormGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>{children}</div>
}

export { Check as CheckIcon }
