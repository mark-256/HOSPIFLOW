'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Building2, Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Breadcrumbs from './Breadcrumbs'
import UserMenu from './UserMenu'
import type { ShellUser } from './Sidebar'

type HeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  user: ShellUser | null
  collapsed: boolean
  navOpen: boolean
  onOpenMobileNav: () => void
  onToggleCollapsed: () => void
  onOpenSearch: () => void
  onSignOut: () => void
  signingOut?: boolean
}

export default function Header({
  title,
  description,
  actions,
  user,
  collapsed,
  navOpen,
  onOpenMobileNav,
  onToggleCollapsed,
  onOpenSearch,
  onSignOut,
  signingOut,
}: HeaderProps) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div
        className="flex items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8"
        style={{ minHeight: 'var(--hf-header-height)' }}
      >
        <Button
          variant="icon"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
          aria-expanded={navOpen}
          className="lg:hidden"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </Button>
        <Button
          variant="icon"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="hidden lg:inline-flex"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="h-5 w-5" />
          )}
        </Button>

        <div className="min-w-0 flex-1 py-2">
          <Breadcrumbs pathname={pathname} title={title} className="hidden sm:block" />
          <h1 className={cn('hf-page-title', pathname === '/dashboard' && 'sm:mt-0.5')}>{title}</h1>
          {description ? <p className="hf-page-description hidden md:block">{description}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSearch}
            aria-label="Search modules (Control K)"
            className="hidden sm:inline-flex"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="ml-1 hidden rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-sans text-2xs text-ink-500 lg:inline">
              Ctrl K
            </kbd>
          </Button>
          <Button
            variant="icon"
            size="sm"
            onClick={onOpenSearch}
            aria-label="Search modules (Control K)"
            className="sm:hidden"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
          </Button>
          {user?.organization?.name ? (
            <span className="hidden max-w-[12rem] items-center gap-1.5 rounded-md border border-line bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-ink-600 xl:inline-flex">
              <Building2 aria-hidden="true" className="h-3.5 w-3.5 text-ink-400" />
              <span className="truncate">{user.organization.name}</span>
            </span>
          ) : null}
          <UserMenu user={user} onSignOut={onSignOut} signingOut={signingOut} />
        </div>
      </div>
    </header>
  )
}
