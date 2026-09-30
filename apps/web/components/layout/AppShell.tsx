'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ToastProvider } from '@/components/feedback/Toast'
import CommandSearch from './CommandSearch'
import Header from './Header'
import Sidebar, { type ShellUser } from './Sidebar'

const COLLAPSE_KEY = 'hospiflow:sidebar-collapsed'

export type AppShellProps = {
  user: ShellUser | null
  title: string
  description?: string
  actions?: ReactNode
  onSignOut: () => void
  signingOut?: boolean
  children: ReactNode
}

/**
 * Application shell: persistent sidebar, sticky header, mobile drawer,
 * command search and the toast surface shared by every module.
 */
export default function AppShell({
  user,
  title,
  description,
  actions,
  onSignOut,
  signingOut,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === 'true')
    } catch {
      setCollapsed(false)
    }
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(next))
      } catch {
        // Storage unavailable (private mode) - keep the in-memory preference.
      }
      return next
    })
  }, [])

  const closeMobileNav = useCallback(() => setNavOpen(false), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!navOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navOpen])

  return (
    <ToastProvider>
      <div className="min-h-screen bg-canvas">
        <a
          href="#main-content"
          className="hf-sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-ink-900 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to main content
        </a>

        <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
          <Sidebar user={user} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </div>

        {navOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 animate-fade-in bg-ink-950/50"
              onClick={closeMobileNav}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 left-0">
              <Sidebar user={user} collapsed={false} variant="mobile" onNavigate={closeMobileNav} />
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            'flex min-h-screen flex-col transition-[padding] duration-200 ease-standard',
            collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64',
          )}
        >
          <Header
            title={title}
            description={description}
            actions={actions}
            user={user}
            collapsed={collapsed}
            navOpen={navOpen}
            onOpenMobileNav={() => setNavOpen(true)}
            onToggleCollapsed={toggleCollapsed}
            onOpenSearch={() => setSearchOpen(true)}
            onSignOut={onSignOut}
            signingOut={signingOut}
          />
          <main id="main-content" className="hf-page flex-1">
            {children}
          </main>
        </div>

        <CommandSearch
          open={searchOpen}
          onOpenChange={setSearchOpen}
          permissions={user?.permissions as string[] | undefined}
        />
      </div>
    </ToastProvider>
  )
}
