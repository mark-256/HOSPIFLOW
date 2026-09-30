'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { isNavItemActive, visibleNavGroups, type NavGroup } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'

export type ShellUser = {
  id?: string
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  permissions?: string[]
  organization?: { id?: string; name?: string }
}

type SidebarProps = {
  user: ShellUser | null
  collapsed: boolean
  onToggleCollapsed?: () => void
  onNavigate?: () => void
  variant?: 'desktop' | 'mobile'
  className?: string
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white', className)}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
        <path d="M15 9h3a2 2 0 0 1 2 2v10" />
        <path d="M9 7h2M9 11h2M9 15h2" />
      </svg>
    </span>
  )
}

function NavItems({ groups, collapsed, onNavigate }: { groups: NavGroup[]; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((group) => (
        <div key={group.id} className="mb-5 last:mb-0">
          <p
            className={cn(
              'mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500',
              collapsed && 'sr-only',
            )}
          >
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, item.href)
              const Icon = item.icon
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'group hf-tooltip-trigger relative flex items-center rounded-md text-sm font-medium transition-colors duration-150 ease-standard',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900',
                    collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-2',
                    active
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'text-ink-300 hover:bg-white/5 hover:text-white',
                  )}
                >
                  {!collapsed && active ? (
                    <span aria-hidden="true" className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand-300" />
                  ) : null}
                  <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-ink-400 group-hover:text-ink-200')} />
                  {collapsed ? (
                    <span className="hf-tooltip" role="presentation">
                      {item.label}
                    </span>
                  ) : (
                    <span className="truncate">{item.label}</span>
                  )}
                  {collapsed ? <span className="hf-sr-only">{item.label}</span> : null}
                </Link>
              )
              return (
                <li key={item.href}>
                  {link}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export default function Sidebar({ user, collapsed, onToggleCollapsed, onNavigate, variant = 'desktop' }: SidebarProps) {
  const groups = visibleNavGroups(user?.permissions)
  const isMobile = variant === 'mobile'

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-ink-950 text-white',
        isMobile ? 'w-[17rem] max-w-[85vw] animate-slide-in-left shadow-xl' : collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center border-b border-white/10',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-4',
        )}
        style={{ height: 'var(--hf-header-height)' }}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-md py-1 focus-visible:ring-2 focus-visible:ring-brand-400"
          aria-label="HOSPIFLOW dashboard"
        >
          <BrandMark />
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-[0.02em] text-white">HOSPIFLOW</span>
              <span className="block truncate text-2xs text-ink-400">
                {user?.organization?.name || 'Hospitality Suite'}
              </span>
            </span>
          ) : null}
        </Link>
        {isMobile ? (
          <Button
            variant="icon"
            size="sm"
            onClick={onNavigate}
            aria-label="Close navigation"
            className="ml-auto text-ink-300 hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <NavItems groups={groups} collapsed={!isMobile && collapsed} onNavigate={onNavigate} />

      {!isMobile && onToggleCollapsed ? (
        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-pressed={collapsed}
            className={cn(
              'flex w-full items-center rounded-md py-2 text-xs font-medium text-ink-400 transition-colors duration-150 hover:bg-white/5 hover:text-white',
              collapsed ? 'justify-center' : 'gap-2 px-2.5',
            )}
          >
            {collapsed ? (
              <ChevronsRight aria-hidden="true" className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft aria-hidden="true" className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  )
}
