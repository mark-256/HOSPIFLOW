'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { ALL_NAV_ITEMS, NAV_GROUPS } from '@/lib/navigation'
import { cn } from '@/lib/utils'

export type Crumb = { label: string; href?: string }

/** Derive a breadcrumb trail from the current route and page title. */
export function buildBreadcrumbs(pathname: string, currentTitle: string): Crumb[] {
  const item = ALL_NAV_ITEMS.find((candidate) => candidate.href === pathname)
  const crumbs: Crumb[] = [{ label: 'Dashboard', href: '/dashboard' }]
  if (!item) {
    if (pathname && pathname !== '/dashboard') crumbs.push({ label: currentTitle })
    return crumbs
  }
  if (item.href !== '/dashboard') {
    const group = NAV_GROUPS.find((candidate) => candidate.items.some((entry) => entry.href === item.href))
    if (group) crumbs.push({ label: group.label })
    crumbs.push({ label: item.label })
  }
  return crumbs
}

type BreadcrumbsProps = {
  pathname: string
  title: string
  className?: string
}

export default function Breadcrumbs({ pathname, title, className }: BreadcrumbsProps) {
  const crumbs = buildBreadcrumbs(pathname, title)
  if (crumbs.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex items-center gap-1 text-xs text-ink-500">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-ink-300" />
              ) : null}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="truncate rounded transition-colors duration-150 hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={cn('truncate', isLast && 'font-medium text-ink-700')} aria-current={isLast ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
