'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import type { ShellUser } from './Sidebar'

type UserMenuProps = {
  user: ShellUser | null
  onSignOut: () => void
  signingOut?: boolean
}

export default function UserMenu({ user, onSignOut, signingOut }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'User'

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-md border border-transparent py-1 pl-1 pr-1.5 transition-colors duration-150 hover:bg-ink-100 sm:pr-2',
          open && 'bg-ink-100',
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
        >
          {initials(user?.firstName, user?.lastName)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[9rem] truncate text-[0.8125rem] font-medium leading-4 text-ink-800">{name}</span>
          <span className="block max-w-[9rem] truncate text-2xs leading-4 text-ink-500">
            {user?.organization?.name || user?.role || ''}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-ink-400 sm:block" />
        <span className="hf-sr-only">Open account menu</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-64 animate-scale-in overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-900">{name}</p>
            <p className="truncate text-xs text-ink-500">{user?.email || 'No email on record'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {user?.role ? (
                <span className="rounded bg-ink-100 px-1.5 py-0.5 text-2xs font-medium text-ink-700">{user.role}</span>
              ) : null}
              {user?.organization?.name ? (
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-2xs font-medium text-brand-700">
                  {user.organization.name}
                </span>
              ) : null}
            </div>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/settings?tab=account')}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-700 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900"
            >
              <UserRound aria-hidden="true" className="h-4 w-4 text-ink-400" />
              Profile
            </button>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-700 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900"
            >
              <Settings aria-hidden="true" className="h-4 w-4 text-ink-400" />
              Settings
            </Link>
          </div>
          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-danger-700 transition-colors duration-150 hover:bg-danger-50 disabled:opacity-60"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {signingOut ? 'Signing out...' : 'Log out'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
