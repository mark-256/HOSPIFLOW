'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Search } from 'lucide-react'
import { searchNavItems, visibleNavGroups, type NavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/Modal'

type CommandSearchProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  permissions?: string[]
}

/**
 * Navigation launcher. HOSPIFLOW has no cross-module data search service, so
 * this searches the module registry and routes to the matching workspace
 * rather than pretending to query production data.
 */
export default function CommandSearch({ open, onOpenChange, permissions }: CommandSearchProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const router = useRouter()
  const listRef = useRef<HTMLUListElement>(null)

  const groups = useMemo(() => visibleNavGroups(permissions), [permissions])
  const results = useMemo(() => searchNavItems(query, groups), [query, groups])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const navigate = useCallback(
    (item: NavItem) => {
      onOpenChange(false)
      router.push(item.href)
    },
    [onOpenChange, router],
  )

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length))
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      navigate(results[activeIndex])
    }
  }

  const quickLinks = results.length === 0 && query.trim() === '' ? groups.flatMap((group) => group.items).slice(0, 6) : []

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} title="Go to" size="md">
      <div onKeyDown={onKeyDown}>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            data-autofocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-search-results"
            aria-autocomplete="list"
            aria-label="Search modules"
            placeholder="Search modules, e.g. reservations, rooms, reports"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </div>

        <ul
          ref={listRef}
          id="command-search-results"
          role="listbox"
          aria-label="Module results"
          className="mt-3 max-h-72 space-y-1 overflow-y-auto"
        >
          {(query.trim() ? results : quickLinks).map((item, index) => {
            const active = index === activeIndex
            const Icon = item.icon
            const groupLabel = 'group' in item ? String(item.group) : ''
            return (
              <li key={item.href} role="option" aria-selected={active}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => navigate(item)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150',
                    active ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100',
                  )}
                >
                  <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-ink-400')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-ink-500">
                      {groupLabel ? `${groupLabel} · ` : ''}
                      {item.description}
                    </span>
                  </span>
                  {active ? (
                    <CornerDownLeft aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>

        {query.trim() && results.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-500">
            No modules match <span className="font-medium text-ink-700">{query}</span>.
          </p>
        ) : null}

        <p className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-2xs text-ink-500">
          <span>Use arrow keys to move, Enter to open, Esc to close</span>
        </p>
      </div>
    </Dialog>
  )
}
