'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

export type TabItem<T extends string = string> = {
  id: T
  label: string
  count?: number
  icon?: React.ReactNode
}

type TabsProps<T extends string> = {
  items: Array<TabItem<T>>
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function Tabs<T extends string>({ items, value, onChange, ariaLabel, className }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const index = items.findIndex((item) => item.id === value)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = items.length - 1
    const target = items[next]
    if (target) {
      onChange(target.id)
      const button = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${target.id}"]`)
      button?.focus()
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-tab-id={item.id}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-500 hover:border-line-strong hover:text-ink-800',
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-2xs font-semibold tabular-nums',
                  active ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-500',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
